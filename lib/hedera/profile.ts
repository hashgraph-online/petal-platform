"use client";

import {
  AccountId,
  AccountUpdateTransaction,
  TransactionId,
} from "@hashgraph/sdk";
import { requireWalletConnectSigner, type DAppSigner } from "@/lib/hedera/wallet-types";
import {
  buildHcs10CreateInboundTopicTx,
  buildHcs10CreateOutboundTopicTx,
  buildHcs20SubmitMessageTx,
  HCS11Client,
  ProfileType,
  type NetworkType,
} from "@hashgraphonline/standards-sdk";
import bs58 from "bs58";

import { env } from "@/config/env";
import { tryGetTopicId } from "@/config/topics";
import { getHederaClient } from "@/lib/hedera/client";
import { lookupAccount } from "@/lib/hedera/mirror";
import { primeRegistryCache, type RegistryProfile } from "@/lib/hedera/registry";
import { buildAccountMemo } from "@/lib/hedera/profile-memo";

export { extractProfileReferenceFromMemo, resolveProfileTopicId } from "@/lib/hedera/profile-memo";
export { loadProfileDocument, type LoadedProfileDocument } from "@/lib/hedera/profile-document";

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
  type: "start" | "progress" | "success" | "skip";
  step: ProfilePublishingStep;
  message?: string;
  progressPercent?: number;
};

export type ProfilePublishingOptions = {
  payerAccountId?: string;
  onStep?: (event: ProfilePublishingEvent) => void;
};

const PROFILE_VERSION = "1.0";
export const HCS10_DEFAULT_TTL_SECONDS = 24 * 60 * 60;

const DEFAULT_NODE_ACCOUNT_IDS: Record<string, readonly string[]> = {
  mainnet: ["0.0.3"],
  testnet: ["0.0.3"],
  previewnet: ["0.0.3"],
};

function resolveNodeAccountIds(network: "mainnet" | "testnet" | "previewnet"): AccountId[] {
  const nodeIds = DEFAULT_NODE_ACCOUNT_IDS[network] ?? DEFAULT_NODE_ACCOUNT_IDS.testnet;
  return nodeIds.map((nodeId) => AccountId.fromString(nodeId));
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
    type: ProfileType.PERSONAL,
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

function resolveStandardsNetwork(network: "mainnet" | "testnet" | "previewnet"): NetworkType {
  return network === "mainnet" ? "mainnet" : "testnet";
}

async function inscribeProfileDocument(
  signer: DAppSigner,
  accountId: string,
  payload: ProfilePayload,
  network: "mainnet" | "testnet" | "previewnet",
  onProgress?: (update: { message: string; progressPercent?: number }) => void,
): Promise<string> {
  const walletSigner = requireWalletConnectSigner(
    signer,
    "Connect a wallet before inscribing profiles.",
  );

  let lastStage: string | null = null;
  let lastPercent: number | null = null;

  const client = new HCS11Client({
    network: resolveStandardsNetwork(network),
    auth: {
      operatorId: accountId,
      signer: walletSigner,
    },
    logLevel: "warn",
    silent: true,
  });

  const result = await client.inscribeProfile(payload, {
    waitForConfirmation: true,
    progressCallback: (progress) => {
      if (!onProgress) {
        return;
      }

      if (!progress?.message || typeof progress.message !== "string") {
        return;
      }

      const percent =
        typeof progress.progressPercent === "number" ? progress.progressPercent : undefined;
      const stage = typeof progress.stage === "string" ? progress.stage : null;

      const normalizedPercent =
        typeof percent === "number" && Number.isFinite(percent)
          ? Math.max(0, Math.min(100, Math.round(percent)))
          : undefined;

      const stageChanged = stage !== lastStage;
      const percentChanged =
        typeof normalizedPercent === "number" &&
        (lastPercent === null || Math.abs(normalizedPercent - lastPercent) >= 2);

      if (!stageChanged && !percentChanged) {
        return;
      }

      lastStage = stage;
      if (typeof normalizedPercent === "number") {
        lastPercent = normalizedPercent;
      }

      onProgress({
        message: progress.message,
        progressPercent: normalizedPercent,
      });
    },
  });
  if (!result.success || !result.profileTopicId) {
    throw new Error(result.error ?? "Failed to inscribe profile document");
  }

  return result.profileTopicId;
}

async function ensureInboxTopic(
  signer: DAppSigner,
  accountId: string,
  existingTopicId: string | undefined,
  payerAccountId: string,
  network: "mainnet" | "testnet" | "previewnet",
): Promise<string> {
  if (existingTopicId) {
    return existingTopicId;
  }

  const tx = buildHcs10CreateInboundTopicTx({
    accountId,
    ttl: HCS10_DEFAULT_TTL_SECONDS,
  })
    .setTransactionId(TransactionId.generate(AccountId.fromString(payerAccountId)))
    .setNodeAccountIds(resolveNodeAccountIds(network));

  tx.freeze();
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
  network: "mainnet" | "testnet" | "previewnet",
): Promise<void> {
  const tx = await new AccountUpdateTransaction()
    .setAccountId(AccountId.fromString(accountId))
    .setAccountMemo(memo)
    .setTransactionId(TransactionId.generate(AccountId.fromString(payerAccountId)))
    .setNodeAccountIds(resolveNodeAccountIds(network))
    .freeze();
  const response = await tx.executeWithSigner(signer);
  await response.getReceiptWithSigner(signer);
}

async function confirmAccountMemo(
  accountId: string,
  expectedMemo: string,
  network: "mainnet" | "testnet" | "previewnet",
  attempts = 5,
  delayMs = 1_000,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const mirrorNetwork = network === "mainnet" ? "mainnet" : "testnet";
    const account = await lookupAccount(accountId, mirrorNetwork).catch(() => null);
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
  network: "mainnet" | "testnet" | "previewnet",
): Promise<string> {
  if (existingTopicId) {
    return existingTopicId;
  }

  void accountId;

  const tx = buildHcs10CreateOutboundTopicTx({
    ttl: HCS10_DEFAULT_TTL_SECONDS,
  })
    .setTransactionId(TransactionId.generate(AccountId.fromString(payerAccountId)))
    .setNodeAccountIds(resolveNodeAccountIds(network));

  tx.freeze();
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
  network: "mainnet" | "testnet" | "previewnet",
): Promise<ProfilePublishResult["registryReceipt"]> {
  const client = getHederaClient(network);
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

  const tx = buildHcs20SubmitMessageTx({
    topicId:
      tryGetTopicId(
        "profileRegistry",
        "environment",
        network === "mainnet" ? "mainnet" : "testnet",
      ) ??
      (() => {
        throw new Error(
          "Profile registry topic is not configured. Run the HCS-2 setup script or connect a wallet to initialize registry topics.",
        );
      })(),
    payload: message,
  })
    .setTransactionId(
      TransactionId.generate(AccountId.fromString(payerAccountId)),
    )
    .setNodeAccountIds(resolveNodeAccountIds(network))
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
  options: ProfilePublishingOptions & { network?: "mainnet" | "testnet" | "previewnet" } = {},
): Promise<ProfilePublishResult> {
  const network = options.network ?? env.HEDERA_NETWORK;
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
      network,
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
      network,
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
  emit({
    type: "start",
    step: "inscribe-profile",
    message: "Uploading profile document to HCS-1",
  });
  const profileTopicId = await inscribeProfileDocument(
    signer,
    input.accountId,
    payload,
    network,
    (update) => {
      emit({
        type: "progress",
        step: "inscribe-profile",
        message: update.message,
        progressPercent: update.progressPercent,
      });
    },
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
  await updateAccountMemo(signer, input.accountId, accountMemo, payerAccountId, network);
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
    network,
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
    network,
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
