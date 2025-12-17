"use client";

import { HRLResolver } from "@hashgraphonline/standards-sdk";
import { Buffer } from "buffer";
import { fetchTopicInfo } from "@/lib/hedera/mirror";
import { env } from "@/config/env";
import { resolveProfileTopicId } from "@/lib/hedera/profile-memo";
import type { ProfilePayload } from "@/lib/hedera/profile";

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

function resolveStandardsNetwork(network?: "mainnet" | "testnet"): "mainnet" | "testnet" {
  if (network) {
    return network;
  }
  return env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet";
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
    }
  }
  const { createHash } = await import("crypto");
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

function decodeArrayBufferToString(data: ArrayBuffer): string {
  const decoder = new TextDecoder();
  return decoder.decode(new Uint8Array(data));
}

function isProfilePayload(value: unknown): value is ProfilePayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.version === "string" &&
    typeof candidate.type === "number" &&
    typeof candidate.display_name === "string" &&
    typeof candidate.uaid === "string"
  );
}

async function loadProfileViaHrl(
  reference: string,
  network?: "mainnet" | "testnet",
): Promise<{
  topicId: string;
  mimeType: string;
  rawJson: string;
  profile: ProfilePayload;
}> {
  const resolver = new HRLResolver("warn");
  const result = await resolver.resolve(reference, {
    network: resolveStandardsNetwork(network),
    returnRaw: true,
  });

  const rawJson =
    typeof result.content === "string"
      ? result.content
      : decodeArrayBufferToString(result.content);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch (error) {
    throw new Error(`Failed to parse profile JSON: ${(error as Error).message}`);
  }

  if (!isProfilePayload(parsed)) {
    throw new Error("Profile document does not match expected HCS-11 shape");
  }

  return {
    topicId: result.topicId,
    mimeType: result.contentType || "application/json",
    rawJson,
    profile: parsed,
  };
}

async function loadProfileDocumentWithMemo(
  reference: string,
  topicId: string,
  mimeType: string,
  rawJson: string,
  profile: ProfilePayload,
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

  const contentBytes = new TextEncoder().encode(rawJson);
  const checksum = (await sha256Hex(contentBytes)).toLowerCase();
  const checksumValid = checksum === memoHash.toLowerCase();

  return {
    reference,
    topicId,
    memo: topicInfo.memo,
    memoHash: memoHash.toLowerCase(),
    compression,
    encoding,
    mimeType,
    rawJson,
    profile,
    checksumValid,
    chunkCount: 0,
    retrievedAt: new Date().toISOString(),
  };
}

export async function loadProfileDocument(
  reference: string,
  options: { network?: "mainnet" | "testnet" } = {},
): Promise<LoadedProfileDocument> {
  const topicId = resolveProfileTopicId(reference);
  if (!topicId) {
    throw new Error("Invalid HCS-1 profile reference");
  }

  const resolved = await loadProfileViaHrl(reference, options.network);
  return loadProfileDocumentWithMemo(
    reference,
    topicId,
    resolved.mimeType,
    resolved.rawJson,
    resolved.profile,
  );
}
