import {
  AccountId,
  AccountUpdateTransaction,
  TopicCreateTransaction,
  TopicId,
  TopicMessageSubmitTransaction,
  TransactionId,
} from "@hashgraph/sdk";
import type { DAppSigner } from "@hashgraph/hedera-wallet-connect";
import { inscribeWithSigner } from "@hashgraphonline/standards-sdk";
import { Buffer } from "buffer";
import bs58 from "bs58";
import { ZSTDDecoder } from "zstddec";

import { env } from "@/config/env";
import { getTopicId } from "@/config/topics";
import { getHederaClient } from "@/lib/hedera/client";
import { fetchAllTopicMessages, fetchTopicInfo, lookupAccount } from "@/lib/hedera/mirror";
import { primeRegistryCache, type RegistryProfile } from "@/lib/hedera/registry";

export type ProfileInput = {
  accountId: string;
  alias: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  inboundTopicId?: string;
  outboundTopicId?: string;
  profileTopicId?: string;
};

export type ProfilePayload = {
  version: string;
  type: number;
  display_name: string;
  uaid: string;
  alias?: string;
  bio?: string;
  profileImage?: string;
  inboundTopicId?: string;
  outboundTopicId?: string;
  base_account?: string;
  properties?: Record<string, unknown>;
};

export type ProfilePublishResult = {
  inboundTopicId: string;
  outboundTopicId: string;
  profileTopicId: string;
  profileReference: string;
  accountMemo: string;
  accountMemoVerified: boolean;
  payload: ProfilePayload;
  registryReceipt: {
    consensusTimestamp?: string;
    sequenceNumber?: number;
    runningHash?: string;
  };
};

export type ProfilePublishingStep =
  | "ensure-inbound"
  | "ensure-outbound"
  | "inscribe-profile"
  | "update-memo"
  | "verify-memo"
  | "publish-registry";

export type ProfilePublishingEvent = {
  type: "start" | "success" | "skip";
  step: ProfilePublishingStep;
  message?: string;
};

export type ProfilePublishingOptions = {
  payerAccountId?: string;
  onStep?: (event: ProfilePublishingEvent) => void;
};

const PROFILE_VERSION = "1.0";
export const HCS10_DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 1 day

const PROFILE_MEMO_PREFIX = "hcs-11:";
const PROFILE_REFERENCE_PREFIX = "hcs://1/";

export type LoadedProfileDocument = {
  reference: string;
  topicId: string;
  memo: string;
  memoHash: string;
  compression: string;
  encoding: string;
  mimeType: string;
  rawJson: string;
  profile: ProfilePayload;
  checksumValid: boolean;
  chunkCount: number;
  retrievedAt: string;
};

let zstdDecoderInstance: ZSTDDecoder | null = null;
let zstdInitPromise: Promise<ZSTDDecoder> | null = null;

async function getZstdDecoder(): Promise<ZSTDDecoder> {
  if (zstdDecoderInstance) {
    return zstdDecoderInstance;
  }
  if (!zstdInitPromise) {
    zstdInitPromise = (async () => {
      const decoder = new ZSTDDecoder();
      await decoder.init();
      zstdDecoderInstance = decoder;
      return decoder;
    })();
  }
  return zstdInitPromise;
}

const DEFAULT_NODE_ACCOUNT_IDS: Record<string, readonly string[]> = {
  mainnet: ["0.0.3"],
  testnet: ["0.0.3"],
  previewnet: ["0.0.3"],
};

function resolveNodeAccountIds(): AccountId[] {
  const nodeIds =
    DEFAULT_NODE_ACCOUNT_IDS[env.HEDERA_NETWORK] ?? DEFAULT_NODE_ACCOUNT_IDS.testnet;
  return nodeIds.map((nodeId) => AccountId.fromString(nodeId));
}

function buildAccountMemo(profileReference: string): string {
  const memo = `hcs-11:${profileReference}`;
  return memo.length > 99 ? memo.slice(0, 99) : memo;
}

function buildInboundTopicMemo(accountId: string): string {
  return `hcs-10:0:${HCS10_DEFAULT_TTL_SECONDS}:0:${accountId}`;
}

function buildOutboundTopicMemo(): string {
  return `hcs-10:0:${HCS10_DEFAULT_TTL_SECONDS}:1`;
}

function createUaid(accountId: string, alias?: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(`${env.HEDERA_NETWORK}:${accountId}`);
  const encoded = bs58.encode(bytes);
  const normalizedAlias = alias?.trim().toLowerCase() || accountId.replace(/\./g, "-");
  const registry = "petal-platform";
  const nativeId = `hedera:${env.HEDERA_NETWORK}:${accountId}`;
  return `uaid:did:${encoded};uid=${normalizedAlias};registry=${registry};nativeId=${nativeId}`;
}

function buildProfilePayload(
  input: ProfileInput,
  inboundTopicId?: string,
  outboundTopicId?: string,
): ProfilePayload {
  const normalizedAlias = input.alias?.trim().toLowerCase();
  return {
    version: PROFILE_VERSION,
    type: 1,
    display_name: input.displayName,
    uaid: createUaid(input.accountId, normalizedAlias),
    alias: normalizedAlias,
    bio: input.bio?.trim() || undefined,
    profileImage: input.avatarUrl?.trim() || undefined,
    inboundTopicId,
    outboundTopicId: outboundTopicId || input.outboundTopicId?.trim() || undefined,
    base_account: input.accountId,
    properties: {
      source: "petal-platform",
      updated_at: new Date().toISOString(),
    },
  };
}

export function extractProfileReferenceFromMemo(memo?: string | null): string | null {
  if (!memo) {
    return null;
  }
  if (!memo.toLowerCase().startsWith(PROFILE_MEMO_PREFIX)) {
    return null;
  }
  const reference = memo.slice(PROFILE_MEMO_PREFIX.length).trim();
  return reference.startsWith(PROFILE_REFERENCE_PREFIX) ? reference : null;
}

export function resolveProfileTopicId(reference: string): string | null {
  if (!reference || !reference.startsWith(PROFILE_REFERENCE_PREFIX)) {
    return null;
  }
  const topicId = reference.slice(PROFILE_REFERENCE_PREFIX.length).trim();
  if (!topicId || !/^0\.0\.[0-9]{3,}$/.test(topicId)) {
    return null;
  }
  return topicId;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof window !== "undefined" && typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const viewArrayCopy = bytes.slice();
      const viewBuffer = viewArrayCopy.buffer as ArrayBuffer;
      const digest = await crypto.subtle.digest("SHA-256", viewBuffer);
      return Array.from(new Uint8Array(digest))
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      // Fallback to Node.js crypto below when WebCrypto digest is unavailable.
    }
  }
  const { createHash } = await import("crypto");
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

async function brotliDecompress(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof process !== "undefined" && process.versions?.node) {
    const { brotliDecompressSync } = await import("zlib");
    const output = brotliDecompressSync(Buffer.from(bytes));
    return output instanceof Uint8Array ? output : new Uint8Array(output);
  }

  if (typeof DecompressionStream !== "undefined" && typeof Response !== "undefined") {
    try {
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const response = new Response(buffer);
      const body = response.body;
      if (body) {
        const stream = body.pipeThrough(
          new DecompressionStream("brotli" as unknown as CompressionFormat),
        );
        const decompressed = await new Response(stream).arrayBuffer();
        return new Uint8Array(decompressed);
      }
    } catch {
      // fall through to wasm-based fallback when native streaming APIs are unavailable
    }
  }

  const { default: brotliPromise } = await import("brotli-wasm");
  const brotli = await brotliPromise;
  const result = brotli.decompress(bytes);
  return result instanceof Uint8Array ? result : new Uint8Array(result);
}

type ChunkPayload = {
  o: number;
  c: string;
};

function parseChunkPayload(base64Message: string): ChunkPayload | null {
  try {
    const json = Buffer.from(base64Message, "base64").toString("utf-8");
    const parsed = JSON.parse(json) as Partial<ChunkPayload>;
    if (typeof parsed.o !== "number" || typeof parsed.c !== "string") {
      return null;
    }
    return { o: parsed.o, c: parsed.c };
  } catch (error) {
    console.warn("profile:failedChunkParse", error);
    return null;
  }
}

function extractDataUri(base64Chunks: string[]): { mimeType: string; base64Payload: string } {
  if (base64Chunks.length === 0) {
    throw new Error("Profile document missing chunk data");
  }
  const concatenated = base64Chunks.join("");
  const match = concatenated.match(/^data:([^;]+);base64,/);
  if (!match) {
    throw new Error("Profile document missing data URI prefix");
  }
  const base64Payload = concatenated.slice(match[0].length);
  if (!base64Payload) {
    throw new Error("Profile document does not contain base64 payload");
  }
  return { mimeType: match[1] ?? "application/octet-stream", base64Payload };
}

async function decodeProfileDocumentFromTopic(
  topicId: string,
  reference: string,
): Promise<LoadedProfileDocument> {
  const topicInfo = await fetchTopicInfo(topicId);
  if (!topicInfo || !topicInfo.memo) {
    throw new Error("Profile topic memo is unavailable");
  }

  const memoParts = topicInfo.memo.split(":");
  if (memoParts.length !== 3) {
    throw new Error("Profile topic memo is not HCS-1 compliant");
  }

  const [memoHash, compressionRaw, encodingRaw] = memoParts;
  const compression = compressionRaw.toLowerCase();
  const encoding = encodingRaw.toLowerCase();

  if (encoding !== "base64") {
    throw new Error(`Unsupported HCS-1 encoding: ${encodingRaw}`);
  }

  if (!["zstd", "none", "identity", "brotli", "br"].includes(compression)) {
    throw new Error(`Unsupported HCS-1 compression: ${compressionRaw}`);
  }

  const messages = await fetchAllTopicMessages(topicId, { order: "asc", pageSize: 100, pageLimit: 20 });
  if (!messages.length) {
    throw new Error("Profile topic does not contain any messages");
  }

  const chunks = messages
    .map((message) => (message.message ? parseChunkPayload(message.message) : null))
    .filter((value): value is ChunkPayload => Boolean(value))
    .sort((a, b) => a.o - b.o);

  if (!chunks.length) {
    throw new Error("Profile topic chunks could not be decoded");
  }

  const { mimeType, base64Payload } = extractDataUri(chunks.map((chunk) => chunk.c));
  const compressedBytes = Buffer.from(base64Payload, "base64");
  let decodedBytes: Uint8Array;

  if (compression === "zstd") {
    const decoder = await getZstdDecoder();
    decodedBytes = decoder.decode(new Uint8Array(compressedBytes));
  } else if (compression === "brotli" || compression === "br") {
    decodedBytes = await brotliDecompress(new Uint8Array(compressedBytes));
  } else {
    decodedBytes = new Uint8Array(compressedBytes);
  }

  const jsonString = new TextDecoder().decode(decodedBytes);
  const checksum = (await sha256Hex(decodedBytes)).toLowerCase();
  const checksumValid = checksum === memoHash.toLowerCase();

  let parsed: ProfilePayload;
  try {
    parsed = JSON.parse(jsonString) as ProfilePayload;
  } catch (error) {
    throw new Error(`Failed to parse profile JSON: ${(error as Error).message}`);
  }

  return {
    reference,
    topicId,
    memo: topicInfo.memo,
    memoHash: memoHash.toLowerCase(),
    compression,
    encoding,
    mimeType,
    rawJson: jsonString,
    profile: parsed,
    checksumValid,
    chunkCount: chunks.length,
    retrievedAt: new Date().toISOString(),
  };
}

export async function loadProfileDocument(reference: string): Promise<LoadedProfileDocument> {
  const topicId = resolveProfileTopicId(reference);
  if (!topicId) {
    throw new Error("Invalid HCS-1 profile reference");
  }
  return decodeProfileDocumentFromTopic(topicId, reference);
}

async function inscribeProfileDocument(
  signer: DAppSigner,
  accountId: string,
  payload: ProfilePayload,
  existingTopicId: string | undefined,
): Promise<string> {
  const buffer = Buffer.from(JSON.stringify(payload), "utf-8");
  const network = env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet";

  const response = await inscribeWithSigner(
    {
      type: "buffer",
      buffer,
      fileName: "profile.json",
      mimeType: "application/json",
    },
    signer,
    {
      mode: "file",
      waitForConfirmation: true,
      network,
      metadata: {
        standard: "hcs-11",
        accountId,
        alias: payload.alias,
        profileType: payload.type,
        ...(existingTopicId ? { topicId: existingTopicId } : {}),
      },
    },
  );

  const topicId =
    response.inscription?.jsonTopicId || response.inscription?.topic_id;

  if (!topicId) {
    throw new Error("HCS-1 inscription did not return a topic ID");
  }

  return topicId;
}

async function ensureInboxTopic(
  signer: DAppSigner,
  accountId: string,
  existingTopicId: string | undefined,
  payerAccountId: string,
): Promise<string> {
  if (existingTopicId) {
    return existingTopicId;
  }

  const memo = buildInboundTopicMemo(accountId);

  const tx = await new TopicCreateTransaction()
    .setTopicMemo(memo.slice(0, 100))
    .setTransactionId(TransactionId.generate(AccountId.fromString(payerAccountId)))
    .setNodeAccountIds(resolveNodeAccountIds())
    .freeze();
  const response = await tx.executeWithSigner(signer);
  const receipt = await response.getReceiptWithSigner(signer);

  if (!receipt.topicId) {
    throw new Error("TopicCreateTransaction did not return a topic ID");
  }

  return receipt.topicId.toString();
}

async function updateAccountMemo(
  signer: DAppSigner,
  accountId: string,
  memo: string,
  payerAccountId: string,
): Promise<void> {
  const tx = await new AccountUpdateTransaction()
    .setAccountId(AccountId.fromString(accountId))
    .setAccountMemo(memo)
    .setTransactionId(TransactionId.generate(AccountId.fromString(payerAccountId)))
    .setNodeAccountIds(resolveNodeAccountIds())
    .freeze();
  const response = await tx.executeWithSigner(signer);
  await response.getReceiptWithSigner(signer);
}

async function confirmAccountMemo(
  accountId: string,
  expectedMemo: string,
  attempts = 5,
  delayMs = 1_000,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const account = await lookupAccount(accountId).catch(() => null);
    if (account?.memo === expectedMemo) {
      return true;
    }

    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return false;
}

async function ensureOutboundTopic(
  signer: DAppSigner,
  accountId: string,
  existingTopicId: string | undefined,
  payerAccountId: string,
): Promise<string> {
  if (existingTopicId) {
    return existingTopicId;
  }

  const memo = buildOutboundTopicMemo();

  const tx = await new TopicCreateTransaction()
    .setTopicMemo(memo.slice(0, 100))
    .setTransactionId(TransactionId.generate(AccountId.fromString(payerAccountId)))
    .setNodeAccountIds(resolveNodeAccountIds())
    .freeze();
  const response = await tx.executeWithSigner(signer);
  const receipt = await response.getReceiptWithSigner(signer);

  if (!receipt.topicId) {
    throw new Error("TopicCreateTransaction did not return a topic ID");
  }

  return receipt.topicId.toString();
}

async function publishProfileToRegistry(
  signer: DAppSigner,
  accountId: string,
  profileReference: string,
  profileTopicId: string,
  inboundTopicId: string | undefined,
  payload: ProfilePayload,
  payerAccountId: string,
): Promise<ProfilePublishResult["registryReceipt"]> {
  const client = getHederaClient();
  const message = JSON.stringify({
    standard: "hcs-11",
    version: payload.version,
    accountId,
    display_name: payload.display_name,
    alias: payload.alias,
    profile_reference: profileReference,
    profile_topic_id: profileTopicId,
    profile_type: payload.type,
    uaid: payload.uaid,
    inboundTopicId,
    outboundTopicId: payload.outboundTopicId,
    profileImage: payload.profileImage,
    updatedAt: new Date().toISOString(),
  });

  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(TopicId.fromString(getTopicId("profileRegistry")))
    .setMessage(message)
    .setTransactionId(
      TransactionId.generate(AccountId.fromString(payerAccountId)),
    )
    .setNodeAccountIds(resolveNodeAccountIds())
    .freezeWith(client);
  const response = await tx.executeWithSigner(signer);
  const receipt = await response.getReceiptWithSigner(signer);

  const receiptWithTopic = receipt as {
    consensusTimestamp?: { toString: () => string };
    topicSequenceNumber?: { toNumber: () => number };
    topicRunningHash?: { toString: (encoding?: string) => string };
  };

  return {
    consensusTimestamp: receiptWithTopic.consensusTimestamp?.toString(),
    sequenceNumber: receiptWithTopic.topicSequenceNumber?.toNumber(),
    runningHash: receiptWithTopic.topicRunningHash?.toString("hex"),
  };
}

export async function createOrUpdateProfile(
  input: ProfileInput,
  signer: DAppSigner,
  options: ProfilePublishingOptions = {},
): Promise<ProfilePublishResult> {
  const payerAccountId = options.payerAccountId ?? input.accountId;
  const emit = (event: ProfilePublishingEvent) => {
    options.onStep?.(event);
  };

  let inboundTopicId = input.inboundTopicId;
  if (inboundTopicId) {
    emit({
      type: "skip",
      step: "ensure-inbound",
      message: `Using existing inbound topic ${inboundTopicId}`,
    });
  } else {
    emit({
      type: "start",
      step: "ensure-inbound",
      message: "Creating inbox topic",
    });
    inboundTopicId = await ensureInboxTopic(
      signer,
      input.accountId,
      undefined,
      payerAccountId,
    );
    emit({
      type: "success",
      step: "ensure-inbound",
      message: `Topic ${inboundTopicId}`,
    });
  }

  let outboundTopicId = input.outboundTopicId;
  if (outboundTopicId) {
    emit({
      type: "skip",
      step: "ensure-outbound",
      message: `Using existing outbound topic ${outboundTopicId}`,
    });
  } else {
    emit({
      type: "start",
      step: "ensure-outbound",
      message: "Provisioning outbound topic",
    });
    outboundTopicId = await ensureOutboundTopic(
      signer,
      input.accountId,
      undefined,
      payerAccountId,
    );
    emit({
      type: "success",
      step: "ensure-outbound",
      message: `Topic ${outboundTopicId}`,
    });
  }

  if (!inboundTopicId || !outboundTopicId) {
    throw new Error("Failed to resolve inbound or outbound topic identifiers");
  }

  const payload = buildProfilePayload(input, inboundTopicId, outboundTopicId);
  const reusingProfileTopic = Boolean(input.profileTopicId);
  emit({
    type: "start",
    step: "inscribe-profile",
    message: reusingProfileTopic
      ? "Updating existing profile document"
      : "Uploading profile document to HCS-1",
  });
  const profileTopicId = await inscribeProfileDocument(
    signer,
    input.accountId,
    payload,
    input.profileTopicId,
  );
  emit({
    type: "success",
    step: "inscribe-profile",
    message: `Profile stored at ${profileTopicId}`,
  });
  const profileReference = `hcs://1/${profileTopicId}`;
  const accountMemo = buildAccountMemo(profileReference);

  emit({
    type: "start",
    step: "update-memo",
    message: "Updating Hedera account memo",
  });
  await updateAccountMemo(signer, input.accountId, accountMemo, payerAccountId);
  emit({
    type: "success",
    step: "update-memo",
    message: accountMemo,
  });

  emit({
    type: "start",
    step: "verify-memo",
    message: "Waiting for mirror node memo update",
  });
  const accountMemoVerified = await confirmAccountMemo(
    input.accountId,
    accountMemo,
  );
  emit({
    type: accountMemoVerified ? "success" : "skip",
    step: "verify-memo",
    message: accountMemoVerified
      ? "Mirror node confirmed memo update"
      : "Mirror cache not yet updated",
  });

  emit({
    type: "start",
    step: "publish-registry",
    message: "Submitting profile registry message",
  });
  const registryReceipt = await publishProfileToRegistry(
    signer,
    input.accountId,
    profileReference,
    profileTopicId,
    inboundTopicId,
    payload,
    payerAccountId,
  );
  emit({
    type: "success",
    step: "publish-registry",
    message: "Registry entry published",
  });

  const cachedProfile: RegistryProfile = {
    accountId: input.accountId,
    alias: input.alias,
    displayName: input.displayName,
    inboundTopicId,
    outboundTopicId,
    profileImage: payload.profileImage,
    bio: input.bio,
    profileReference,
    profileTopicId,
    profileType: payload.type,
    uaid: payload.uaid,
    consensusTimestamp: registryReceipt.consensusTimestamp,
    sequenceNumber: registryReceipt.sequenceNumber,
    raw: payload as unknown as Record<string, unknown>,
  };
  primeRegistryCache(cachedProfile);

  return {
    inboundTopicId,
    outboundTopicId,
    profileTopicId,
    profileReference,
    accountMemo,
    accountMemoVerified,
    payload,
    registryReceipt,
  };
}
