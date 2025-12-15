import { env, getMirrorNodeUrl } from "@/config/env";

type TopicName = "profileRegistry" | "floraRegistry";

type TopicScope = "environment" | "global";

const TOPIC_ID_PATTERN = /^0\.0\.\d+$/u;
const PLACEHOLDER_TOPIC_IDS = new Set(["0.0.1000", "0.0.1001"]);
const TOPIC_OVERRIDE_NAMESPACE = "petal-topics";

type TopicDefinition = {
  description: string;
  environment: {
    testnet?: string;
    mainnet?: string;
  };
  global: {
    testnet?: string;
    mainnet?: string;
  };
};

const topicDefinitions: Record<TopicName, TopicDefinition> = {
  profileRegistry: {
    description: "HCS-11 profile registry topic",
    environment: {
      testnet: env.NEXT_PUBLIC_TESTNET_PROFILE_REGISTRY_TOPIC_ID,
      mainnet: env.NEXT_PUBLIC_MAINNET_PROFILE_REGISTRY_TOPIC_ID,
    },
    global: {
      testnet: env.NEXT_PUBLIC_TESTNET_GLOBAL_PROFILE_REGISTRY_TOPIC_ID,
      mainnet: env.NEXT_PUBLIC_MAINNET_GLOBAL_PROFILE_REGISTRY_TOPIC_ID,
    },
  },
  floraRegistry: {
    description: "HCS-16 flora registry topic",
    environment: {
      testnet: env.NEXT_PUBLIC_TESTNET_FLORA_REGISTRY_TOPIC_ID,
      mainnet: env.NEXT_PUBLIC_MAINNET_FLORA_REGISTRY_TOPIC_ID,
    },
    global: {
      testnet: env.NEXT_PUBLIC_TESTNET_GLOBAL_FLORA_REGISTRY_TOPIC_ID,
      mainnet: env.NEXT_PUBLIC_MAINNET_GLOBAL_FLORA_REGISTRY_TOPIC_ID,
    },
  },
};

export function getTopicDefinition(name: TopicName): TopicDefinition {
  return topicDefinitions[name];
}

export function getTopicOverrideKey(args: {
  name: TopicName;
  scope: TopicScope;
  network: "mainnet" | "testnet";
}): string {
  return `${TOPIC_OVERRIDE_NAMESPACE}:${args.network}:${args.scope}:${args.name}`;
}

export function getTopicOverride(args: {
  name: TopicName;
  scope: TopicScope;
  network: "mainnet" | "testnet";
}): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    const stored = window.localStorage.getItem(getTopicOverrideKey(args));
    if (!stored) return undefined;
    const trimmed = stored.trim();
    if (!trimmed) return undefined;
    if (!TOPIC_ID_PATTERN.test(trimmed)) return undefined;
    if (PLACEHOLDER_TOPIC_IDS.has(trimmed)) return undefined;
    return trimmed;
  } catch {
    return undefined;
  }
}

export function setTopicOverride(args: {
  name: TopicName;
  scope: TopicScope;
  network: "mainnet" | "testnet";
  topicId: string;
}): void {
  if (typeof window === "undefined") {
    return;
  }
  const trimmed = args.topicId.trim();
  if (!TOPIC_ID_PATTERN.test(trimmed) || PLACEHOLDER_TOPIC_IDS.has(trimmed)) {
    return;
  }
  try {
    window.localStorage.setItem(getTopicOverrideKey(args), trimmed);
  } catch {
    return;
  }
}

export function getTopicId(
  name: TopicName,
  scope: TopicScope = "environment",
  network: "mainnet" | "testnet" = env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet",
): string {
  const resolved = tryGetTopicId(name, scope, network);
  if (!resolved) {
    throw new Error(
      `Missing topic configuration for ${name} (${scope}, ${network}). Run HCS-2 setup or connect a wallet to initialize topics.`,
    );
  }
  return resolved;
}

export function tryGetTopicId(
  name: TopicName,
  scope: TopicScope = "environment",
  network: "mainnet" | "testnet" = env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet",
): string | undefined {
  const override = getTopicOverride({ name, scope, network });
  if (override) {
    return override;
  }

  const definition = getTopicDefinition(name);
  const scoped = scope === "global" ? definition.global : definition.environment;
  const networkValue = network === "mainnet" ? scoped.mainnet : scoped.testnet;
  const candidates = [networkValue];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    if (!TOPIC_ID_PATTERN.test(trimmed)) continue;
    if (PLACEHOLDER_TOPIC_IDS.has(trimmed)) continue;
    return trimmed;
  }

  return undefined;
}

export function topicExplorerUrl(topicId: string, network?: "mainnet" | "testnet"): string {
  const base = getMirrorNodeUrl(
    network ?? (env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet"),
  ).replace(/\/$/, "");
  return `${base}/topics/${topicId}`;
}
