"use client";

import type { HashinalsWalletConnectSDK } from "@hashgraphonline/hashinal-wc";
import { BrowserHCS2Client, HCS2RegistryType } from "@hashgraphonline/standards-sdk";
import { env, getMirrorNodeUrl } from "@/config/env";
import { setTopicOverride, tryGetTopicId } from "@/config/topics";
import { fetchTopicInfo } from "@/lib/hedera/mirror";

type Network = "mainnet" | "testnet";

type TopicScopedName =
  | "PROFILE_REGISTRY_TOPIC_ID"
  | "FLORA_REGISTRY_TOPIC_ID"
  | "GLOBAL_PROFILE_REGISTRY_TOPIC_ID"
  | "GLOBAL_FLORA_REGISTRY_TOPIC_ID";

type BootstrapTopic = {
  name: "profileRegistry" | "floraRegistry";
  scope: "environment" | "global";
  scopedName: TopicScopedName;
};

type BootstrapResult = {
  created: Partial<Record<TopicScopedName, string>>;
  resolved: Partial<Record<TopicScopedName, string>>;
  persisted: boolean;
};

const TOPIC_ID_PATTERN = /^0\.0\.\d+$/u;

const BOOTSTRAP_TOPICS: readonly BootstrapTopic[] = [
  {
    name: "profileRegistry",
    scope: "environment",
    scopedName: "PROFILE_REGISTRY_TOPIC_ID",
  },
  {
    name: "floraRegistry",
    scope: "environment",
    scopedName: "FLORA_REGISTRY_TOPIC_ID",
  },
  {
    name: "profileRegistry",
    scope: "global",
    scopedName: "GLOBAL_PROFILE_REGISTRY_TOPIC_ID",
  },
  {
    name: "floraRegistry",
    scope: "global",
    scopedName: "GLOBAL_FLORA_REGISTRY_TOPIC_ID",
  },
];

function toNetworkPrefix(network: Network): "TESTNET" | "MAINNET" {
  return network === "mainnet" ? "MAINNET" : "TESTNET";
}

function isValidTopicId(value: string | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && TOPIC_ID_PATTERN.test(trimmed);
}

function readPrefixedTopicId(network: Network, scopedName: TopicScopedName): string | undefined {
  const value = (() => {
    switch (scopedName) {
      case "PROFILE_REGISTRY_TOPIC_ID":
        return network === "mainnet"
          ? env.NEXT_PUBLIC_MAINNET_PROFILE_REGISTRY_TOPIC_ID
          : env.NEXT_PUBLIC_TESTNET_PROFILE_REGISTRY_TOPIC_ID;
      case "FLORA_REGISTRY_TOPIC_ID":
        return network === "mainnet"
          ? env.NEXT_PUBLIC_MAINNET_FLORA_REGISTRY_TOPIC_ID
          : env.NEXT_PUBLIC_TESTNET_FLORA_REGISTRY_TOPIC_ID;
      case "GLOBAL_PROFILE_REGISTRY_TOPIC_ID":
        return network === "mainnet"
          ? env.NEXT_PUBLIC_MAINNET_GLOBAL_PROFILE_REGISTRY_TOPIC_ID
          : env.NEXT_PUBLIC_TESTNET_GLOBAL_PROFILE_REGISTRY_TOPIC_ID;
      case "GLOBAL_FLORA_REGISTRY_TOPIC_ID":
        return network === "mainnet"
          ? env.NEXT_PUBLIC_MAINNET_GLOBAL_FLORA_REGISTRY_TOPIC_ID
          : env.NEXT_PUBLIC_TESTNET_GLOBAL_FLORA_REGISTRY_TOPIC_ID;
    }
  })();

  return isValidTopicId(value) ? value : undefined;
}

async function topicExists(topicId: string, network: Network): Promise<boolean> {
  const info = await fetchTopicInfo(topicId, network).catch(() => null);
  return Boolean(info?.topic_id);
}

async function persistTopicsToEnv(args: {
  network: Network;
  topics: Partial<Record<TopicScopedName, string>>;
}): Promise<boolean> {
  const keys = Object.keys(args.topics);
  if (keys.length === 0) return true;

  try {
    const response = await fetch("/api/dev/hcs2-topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!response.ok) {
      return false;
    }
    const payload = (await response.json()) as { success?: boolean };
    return payload.success === true;
  } catch {
    return false;
  }
}

export async function ensureHcs2RegistryTopics(args: {
  hwc: HashinalsWalletConnectSDK;
  network: Network;
}): Promise<BootstrapResult> {
  const mirrorNodeUrl = getMirrorNodeUrl(args.network);
  const client = new BrowserHCS2Client({
    network: args.network,
    hwc: args.hwc,
    mirrorNodeUrl,
    silent: true,
    logLevel: "warn",
  });

  const created: Partial<Record<TopicScopedName, string>> = {};
  const toPersist: Partial<Record<TopicScopedName, string>> = {};
  const resolved: Partial<Record<TopicScopedName, string>> = {};

  for (const topic of BOOTSTRAP_TOPICS) {
    const candidate = tryGetTopicId(topic.name, topic.scope, args.network);
    const existingTopicId = isValidTopicId(candidate) ? candidate : undefined;
    const shouldReuse =
      existingTopicId ? await topicExists(existingTopicId, args.network) : false;

    let topicId: string;
    if (shouldReuse && existingTopicId) {
      topicId = existingTopicId;
    } else {
      const response = await client.createRegistry({
        registryType: HCS2RegistryType.INDEXED,
        ttl: 86400,
      });

      if (!response.success || !response.topicId) {
        throw new Error(response.error ?? "Failed to create HCS-2 registry topics");
      }
      topicId = response.topicId;
      created[topic.scopedName] = topicId;
    }

    resolved[topic.scopedName] = topicId;
    const envValue = readPrefixedTopicId(args.network, topic.scopedName);
    if (!envValue || envValue !== topicId) {
      toPersist[topic.scopedName] = topicId;
    }
    setTopicOverride({
      name: topic.name,
      scope: topic.scope,
      network: args.network,
      topicId,
    });
  }

  const persisted = await persistTopicsToEnv({
    network: args.network,
    topics: toPersist,
  });

  return { created, resolved, persisted };
}

export function getTopicEnvHints(args: {
  network: Network;
  topics: Partial<Record<TopicScopedName, string>>;
}): Array<{ key: string; value: string }> {
  const updates: Array<{ key: string; value: string }> = [];
  const prefix = toNetworkPrefix(args.network);

  for (const [scopedName, value] of Object.entries(args.topics) as Array<
    [TopicScopedName, string]
  >) {
    if (!isValidTopicId(value)) continue;
    updates.push({ key: `NEXT_PUBLIC_${prefix}_${scopedName}`, value });
  }

  return updates;
}
