import { Buffer } from "buffer";
import { getTopicId } from "@/config/topics";
import { env, isDebug, isDevelopment } from "@/config/env";
import {
  fetchTopicMessages,
  type MirrorTopicMessage,
} from "@/lib/hedera/mirror";

export type RegistryProfile = {
  accountId: string;
  alias?: string;
  displayName?: string;
  inboundTopicId?: string;
  outboundTopicId?: string;
  profileImage?: string;
  bio?: string;
  profileReference?: string;
  profileTopicId?: string;
  profileType?: number;
  uaid?: string;
  consensusTimestamp?: string;
  sequenceNumber?: number;
  raw?: Record<string, unknown>;
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const CACHE_NAMESPACE = "petal-registry";
const DEFAULT_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const RECENT_CACHE_KEY = (limit: number) => `recent:${limit}`;
const ALIAS_CACHE_KEY = (alias: string) => `alias:${alias}`;
const ACCOUNT_CACHE_KEY = (accountId: string) => `account:${accountId}`;

function now(): number {
  return Date.now();
}

function readCache<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(`${CACHE_NAMESPACE}:${key}`);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (parsed.expiresAt < now()) {
      window.localStorage.removeItem(`${CACHE_NAMESPACE}:${key}`);
      return null;
    }
    return parsed.value;
  } catch (error) {
    if (isDevelopment) {
      console.warn("Failed to read registry cache", key, error);
    }
    return null;
  }
}

function writeCache<T>(key: string, value: T, ttlMs = DEFAULT_CACHE_TTL_MS): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const entry: CacheEntry<T> = {
      value,
      expiresAt: now() + ttlMs,
    };
    window.localStorage.setItem(
      `${CACHE_NAMESPACE}:${key}`,
      JSON.stringify(entry),
    );
  } catch (error) {
    if (isDevelopment) {
      console.warn("Failed to write registry cache", key, error);
    }
  }
}

function decodeMessagePayload(message?: string): Record<string, unknown> | null {
  if (!message) {
    return null;
  }

  try {
    const jsonString = decodeBase64(message);
    return JSON.parse(jsonString) as Record<string, unknown>;
  } catch (error) {
    if (isDevelopment) {
      console.warn("Failed to decode registry message", error);
    }
    return null;
  }
}

function decodeBase64(data: string): string {
  if (typeof window !== "undefined" && typeof window.atob === "function") {
    return window.atob(data);
  }

  return Buffer.from(data, "base64").toString("utf-8");
}

function extractProfileFromMessage(
  message: MirrorTopicMessage,
): RegistryProfile | null {
  const payload = decodeMessagePayload(message.message);
  if (!payload) {
    return null;
  }

  const accountId =
    (payload.accountId as string | undefined) ||
    (payload.base_account as string | undefined);

  if (!accountId) {
    return null;
  }

  const alias = (payload.alias as string | undefined)?.toLowerCase();
  const displayName = payload.display_name as string | undefined;
  const inboundTopicId =
    (payload.inboundTopicId as string | undefined) ||
    (payload.inbound_topic_id as string | undefined);
  const outboundTopicId =
    (payload.outboundTopicId as string | undefined) ||
    (payload.outbound_topic_id as string | undefined);
  const profileImage =
    (payload.profileImage as string | undefined) ||
    (payload.profile_image as string | undefined);
  const profileReference =
    (payload.profile_reference as string | undefined) ||
    (payload.profileReference as string | undefined);
  const profileTopicId =
    (payload.profile_topic_id as string | undefined) ||
    (payload.profileTopicId as string | undefined);
  const profileType =
    typeof payload.profile_type === "number"
      ? (payload.profile_type as number)
      : typeof payload.type === "number"
        ? (payload.type as number)
        : undefined;
  const uaid = payload.uaid as string | undefined;
  const bio = payload.bio as string | undefined;

  return {
    accountId,
    alias,
    displayName,
    inboundTopicId,
    outboundTopicId,
    profileImage,
    bio,
    profileReference,
    profileTopicId,
    profileType,
    uaid,
    consensusTimestamp: message.consensusTimestamp,
    sequenceNumber: message.sequenceNumber,
    raw: payload,
  };
}

async function fetchRegistryMessages(limit = 100): Promise<MirrorTopicMessage[]> {
  const topicId = getTopicId("profileRegistry");
  const messages = await fetchTopicMessages(topicId, { limit, order: "desc" });
  if (isDebug) {
    console.debug(
      "registry:fetchTopicMessages",
      topicId,
      `limit=${limit}`,
      `mirror=${env.NEXT_PUBLIC_MIRROR_NODE_URL}`,
    );
  }
  return messages;
}

function dedupeProfiles(messages: MirrorTopicMessage[]): RegistryProfile[] {
  const seen = new Set<string>();
  const profiles: RegistryProfile[] = [];

  for (const message of messages) {
    const profile = extractProfileFromMessage(message);
    if (!profile || !profile.accountId) {
      continue;
    }
    if (seen.has(profile.accountId)) {
      continue;
    }
    seen.add(profile.accountId);
    profiles.push(profile);
  }

  return profiles;
}

export async function listRecentProfiles(limit = 20): Promise<RegistryProfile[]> {
  const cacheKey = RECENT_CACHE_KEY(limit);
  const cached = readCache<RegistryProfile[]>(cacheKey);
  if (cached) {
    if (isDebug) {
      console.debug("registry:listRecentProfiles cache-hit", { limit });
    }
    return cached;
  }

  const messages = await fetchRegistryMessages(limit * 2);
  const profiles = dedupeProfiles(messages).slice(0, limit);

  writeCache(cacheKey, profiles);
  return profiles;
}

export async function searchProfileByAlias(
  alias: string,
): Promise<RegistryProfile | null> {
  const normalized = alias.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const cacheKey = ALIAS_CACHE_KEY(normalized);
  const cached = readCache<RegistryProfile | null>(cacheKey);
  if (cached) {
    if (isDebug) {
      console.debug("registry:searchProfileByAlias cache-hit", normalized);
    }
    return cached;
  }

  const profiles = await listRecentProfiles(100);
  const match = profiles.find((profile) => profile.alias === normalized) ?? null;

  writeCache(cacheKey, match);
  if (isDebug) {
    console.debug("registry:searchProfileByAlias lookup", normalized, {
      found: Boolean(match),
    });
  }
  return match;
}

export async function fetchLatestProfileForAccount(
  accountId: string,
): Promise<RegistryProfile | null> {
  const normalized = accountId.trim();
  if (!normalized) {
    return null;
  }

  const cacheKey = ACCOUNT_CACHE_KEY(normalized);
  const cached = readCache<RegistryProfile | null>(cacheKey);
  if (cached) {
    if (isDebug) {
      console.debug("registry:fetchLatestProfileForAccount cache-hit", normalized);
    }
    return cached;
  }

  const messages = await fetchRegistryMessages(100);
  const profiles = dedupeProfiles(messages);
  const match = profiles.find((profile) => profile.accountId === normalized) ?? null;

  writeCache(cacheKey, match);
  if (isDebug) {
    console.debug("registry:fetchLatestProfileForAccount lookup", normalized, {
      found: Boolean(match),
    });
  }
  return match;
}

export function clearRegistryCache(): void {
  if (typeof window === "undefined") {
    return;
  }

  Object.keys(window.localStorage)
    .filter((key) => key.startsWith(`${CACHE_NAMESPACE}:`))
    .forEach((key) => window.localStorage.removeItem(key));
}


export function primeRegistryCache(profile: RegistryProfile): void {
  const normalizedAccount = profile.accountId.trim();
  if (!normalizedAccount) {
    return;
  }

  writeCache(ACCOUNT_CACHE_KEY(normalizedAccount), profile);
  if (profile.alias) {
    writeCache(ALIAS_CACHE_KEY(profile.alias), profile);
  }
}
