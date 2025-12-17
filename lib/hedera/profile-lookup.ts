"use client";

import { z } from "zod";
import { env } from "@/config/env";
import {
  fetchLatestProfileForAccount,
  listRecentProfiles,
  type RegistryProfile,
} from "@/lib/hedera/registry";
import { loadProfileDocument } from "@/lib/hedera/profile-document";

type Network = "mainnet" | "testnet";

const API_SUFFIX = "/api/v1";

function ensureApiBase(url: string): string {
  const trimmed = url.replace(/\/+$/u, "");
  if (trimmed.length === 0) {
    return API_SUFFIX;
  }
  if (/\/api\/v\d+$/iu.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}${API_SUFFIX}`;
}

const brokerAgentSchema = z.object({
  profile: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const brokerSearchSchema = z.object({
  hits: z.array(brokerAgentSchema).default([]),
});

function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function toRegistryProfile(profile: Record<string, unknown>): RegistryProfile | null {
  const accountId =
    getString(profile, "accountId") ??
    getString(profile, "base_account");
  if (!accountId) {
    return null;
  }

  const alias = (getString(profile, "alias") ?? undefined)?.toLowerCase();
  const displayName =
    getString(profile, "display_name") ?? getString(profile, "displayName");

  const inboundTopicId =
    getString(profile, "inboundTopicId") ??
    getString(profile, "inbound_topic_id");
  const outboundTopicId =
    getString(profile, "outboundTopicId") ??
    getString(profile, "outbound_topic_id");

  const profileImage =
    getString(profile, "profileImage") ?? getString(profile, "profile_image");
  const profileReference =
    getString(profile, "profile_reference") ?? getString(profile, "profileReference");
  const profileTopicId =
    getString(profile, "profile_topic_id") ?? getString(profile, "profileTopicId");
  const uaid = getString(profile, "uaid");
  const bio = getString(profile, "bio");

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
    uaid,
    raw: profile,
  };
}

function getBrokerNetwork(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata) {
    return null;
  }
  const network = metadata.network;
  return typeof network === "string" ? network.toLowerCase() : null;
}

async function fetchBrokerProfiles(
  query: string,
  network: Network,
  limit: number,
): Promise<RegistryProfile[]> {
  if (!env.HASHGRAPH_REGISTRY_BROKER_URL) {
    return [];
  }

  const base = ensureApiBase(env.HASHGRAPH_REGISTRY_BROKER_URL);
  const searchParams = new URLSearchParams();
  searchParams.set("q", query);
  searchParams.set("page", "1");
  searchParams.set("limit", String(Math.max(5, Math.min(50, limit))));

  const url = `${base}/search?${searchParams.toString()}`;
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) {
    return [];
  }

  const parsed = brokerSearchSchema.safeParse(await response.json());
  if (!parsed.success) {
    return [];
  }

  const profiles: RegistryProfile[] = [];
  for (const hit of parsed.data.hits) {
    const hitNetwork = getBrokerNetwork(hit.metadata);
    if (hitNetwork && hitNetwork !== network) {
      continue;
    }

    const profileRecord = hit.profile;
    if (!profileRecord) {
      continue;
    }
    const mapped = toRegistryProfile(profileRecord);
    if (!mapped) {
      continue;
    }
    profiles.push(mapped);
  }

  return profiles;
}

function rankMatch(profile: RegistryProfile, query: string): number {
  const normalized = query.trim().toLowerCase();
  const alias = profile.alias?.toLowerCase() ?? "";
  const display = profile.displayName?.toLowerCase() ?? "";
  const account = profile.accountId.toLowerCase();

  if (alias === normalized) return 0;
  if (account === normalized) return 1;
  if (alias.startsWith(normalized)) return 2;
  if (display.startsWith(normalized)) return 3;
  if (alias.includes(normalized)) return 4;
  if (display.includes(normalized)) return 5;
  if (account.includes(normalized)) return 6;
  return 999;
}

function dedupeProfiles(profiles: RegistryProfile[]): RegistryProfile[] {
  const seen = new Set<string>();
  const result: RegistryProfile[] = [];
  for (const profile of profiles) {
    const key = profile.accountId.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(profile);
  }
  return result;
}

function isAccountId(value: string): boolean {
  return /^\d+\.\d+\.\d+$/u.test(value.trim());
}

function normalizeReference(reference: string): string | null {
  const trimmed = reference.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("hcs://1/")) {
    return trimmed;
  }
  if (isAccountId(trimmed)) {
    return `hcs://1/${trimmed}`;
  }
  return null;
}

export async function searchRegistryProfiles(
  query: string,
  options: { network: Network; limit?: number },
): Promise<RegistryProfile[]> {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) {
    return [];
  }

  const limit = options.limit ?? 8;
  const [recent, broker] = await Promise.all([
    listRecentProfiles(250),
    fetchBrokerProfiles(normalized, options.network, Math.max(limit, 12)),
  ]);

  const localMatches = recent.filter((profile) => rankMatch(profile, normalized) < 999);
  const merged = dedupeProfiles([...localMatches, ...broker])
    .sort((a, b) => rankMatch(a, normalized) - rankMatch(b, normalized))
    .slice(0, limit);
  return merged;
}

async function ensureInboundTopic(
  profile: RegistryProfile,
  network: Network,
): Promise<RegistryProfile> {
  if (profile.inboundTopicId) {
    return profile;
  }

  const reference =
    normalizeReference(profile.profileReference ?? "") ??
    normalizeReference(profile.profileTopicId ?? "");

  if (!reference) {
    return profile;
  }

  try {
    const document = await loadProfileDocument(reference, { network });
    return {
      ...profile,
      inboundTopicId: document.profile.inboundTopicId ?? profile.inboundTopicId,
      outboundTopicId: document.profile.outboundTopicId ?? profile.outboundTopicId,
      profileImage: document.profile.profileImage ?? profile.profileImage,
      bio: document.profile.bio ?? profile.bio,
      displayName: document.profile.display_name ?? profile.displayName,
      alias: document.profile.alias?.toLowerCase() ?? profile.alias,
      profileReference: reference,
      profileTopicId: document.topicId ?? profile.profileTopicId,
    };
  } catch {
    return profile;
  }
}

export async function resolveProfileByIdentifier(
  identifier: string,
  options: { network: Network; requireInboundTopic?: boolean },
): Promise<RegistryProfile | null> {
  const normalized = identifier.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const requireInboundTopic = options.requireInboundTopic ?? false;

  if (isAccountId(normalized)) {
    const profile = await fetchLatestProfileForAccount(normalized);
    if (!profile) {
      return null;
    }
    const withInbound = await ensureInboundTopic(profile, options.network);
    if (requireInboundTopic && !withInbound.inboundTopicId) {
      return null;
    }
    return withInbound;
  }

  const matches = await searchRegistryProfiles(normalized, { network: options.network, limit: 10 });
  const exact =
    matches.find((profile) => profile.alias?.toLowerCase() === normalized) ??
    matches[0] ??
    null;
  if (!exact) {
    return null;
  }

  const withInbound = await ensureInboundTopic(exact, options.network);
  if (requireInboundTopic && !withInbound.inboundTopicId) {
    return null;
  }
  return withInbound;
}
