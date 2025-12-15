import fs from "node:fs";
import path from "node:path";
import dotenvFlow from "dotenv-flow";
import { HCS2Client, HCS2RegistryType } from "@hashgraphonline/standards-sdk";

type HederaNetwork = "mainnet" | "testnet";

const TOPIC_ID_PATTERN = /^0\.0\.\d+$/u;
const PLACEHOLDER_TOPIC_IDS = new Set(["0.0.1000", "0.0.1001"]);

type TopicKeyName = "PROFILE_REGISTRY_TOPIC_ID" | "FLORA_REGISTRY_TOPIC_ID";

type ScopedTopicKeyName =
  | TopicKeyName
  | `GLOBAL_${TopicKeyName}`;

type NetworkPrefix = "TESTNET" | "MAINNET";

type PrefixedEnvKey = `NEXT_PUBLIC_${NetworkPrefix}_${ScopedTopicKeyName}`;

type TargetEnvKey = PrefixedEnvKey;

const TOPIC_KEYS: ScopedTopicKeyName[] = [
  "PROFILE_REGISTRY_TOPIC_ID",
  "FLORA_REGISTRY_TOPIC_ID",
  "GLOBAL_PROFILE_REGISTRY_TOPIC_ID",
  "GLOBAL_FLORA_REGISTRY_TOPIC_ID",
];

function parseBooleanFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function parseValueFlag(name: string): string | undefined {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : undefined;
}

function readEnvValue(key: string): string | undefined {
  const value = process.env[key];
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function resolveNetwork(value: string | undefined): HederaNetwork {
  if (value === "mainnet") return "mainnet";
  if (value === "testnet") return "testnet";
  if (value === "previewnet") {
    throw new Error("HCS-2 topic setup does not support previewnet.");
  }
  return "testnet";
}

function toNetworkPrefix(network: HederaNetwork): NetworkPrefix {
  return network === "mainnet" ? "MAINNET" : "TESTNET";
}

function getPrefixedKey(network: HederaNetwork, scopedName: ScopedTopicKeyName): PrefixedEnvKey {
  return `NEXT_PUBLIC_${toNetworkPrefix(network)}_${scopedName}`;
}

function resolveMirrorNodeUrl(network: HederaNetwork): string | undefined {
  const prefixed =
    network === "mainnet"
      ? readEnvValue("NEXT_PUBLIC_MAINNET_MIRROR_NODE_URL")
      : readEnvValue("NEXT_PUBLIC_TESTNET_MIRROR_NODE_URL");
  return prefixed ?? readEnvValue("NEXT_PUBLIC_MIRROR_NODE_URL");
}

function resolveOperatorCredentials(network: HederaNetwork): { operatorId?: string; operatorKey?: string } {
  const prefixedId = readEnvValue(`${toNetworkPrefix(network)}_HEDERA_ACCOUNT_ID`);
  const prefixedKey = readEnvValue(`${toNetworkPrefix(network)}_HEDERA_PRIVATE_KEY`);
  return {
    operatorId: prefixedId ?? readEnvValue("HEDERA_ACCOUNT_ID"),
    operatorKey: prefixedKey ?? readEnvValue("HEDERA_PRIVATE_KEY"),
  };
}

async function topicExists(mirrorNodeUrl: string | undefined, topicId: string): Promise<boolean> {
  if (!mirrorNodeUrl) {
    return true;
  }
  try {
    const url = `${mirrorNodeUrl.replace(/\/$/, "")}/topics/${topicId}`;
    const response = await fetch(url, { method: "GET" });
    if (response.status === 404) {
      return false;
    }
    return response.ok;
  } catch {
    return true;
  }
}

async function shouldCreateTopic(args: {
  currentValue: string | undefined;
  force: boolean;
  mirrorNodeUrl: string | undefined;
}): Promise<boolean> {
  if (args.force) return true;
  if (!args.currentValue) return true;
  if (!TOPIC_ID_PATTERN.test(args.currentValue)) return true;
  if (PLACEHOLDER_TOPIC_IDS.has(args.currentValue)) return true;
  const exists = await topicExists(args.mirrorNodeUrl, args.currentValue);
  return !exists;
}

function getTargetNetworks(): HederaNetwork[] {
  const raw = parseValueFlag("--network");
  if (raw === "both") {
    return ["testnet", "mainnet"];
  }
  if (raw === "mainnet") return ["mainnet"];
  if (raw === "testnet") return ["testnet"];
  return [resolveNetwork(readEnvValue("HEDERA_NETWORK"))];
}


function requireOperatorCredentials(network: HederaNetwork, dryRun: boolean): { operatorId: string; operatorKey: string } {
  const creds = resolveOperatorCredentials(network);
  if (dryRun) {
    return { operatorId: "", operatorKey: "" };
  }
  if (!creds.operatorId) {
    throw new Error(
      `Missing operator credentials for ${network}. Provide ${toNetworkPrefix(network)}_HEDERA_ACCOUNT_ID (or HEDERA_ACCOUNT_ID).`,
    );
  }
  if (!creds.operatorKey) {
    throw new Error(
      `Missing operator credentials for ${network}. Provide ${toNetworkPrefix(network)}_HEDERA_PRIVATE_KEY (or HEDERA_PRIVATE_KEY).`,
    );
  }
  return { operatorId: creds.operatorId, operatorKey: creds.operatorKey };
}

function resolveExistingTopicValue(network: HederaNetwork, scopedName: ScopedTopicKeyName): string | undefined {
  return readEnvValue(getPrefixedKey(network, scopedName));
}

function replaceOrAppendEnvLines(
  source: string,
  updates: Array<{ key: string; value: string }>,
): string {
  const lines = source.split(/\r?\n/u);
  const keyToIndex = new Map<string, number>();

  lines.forEach((line, index) => {
    const match = /^\s*([A-Z0-9_]+)\s*=/.exec(line);
    if (match?.[1]) {
      keyToIndex.set(match[1], index);
    }
  });

  for (const update of updates) {
    const nextLine = `${update.key}=${update.value}`;
    const existingIndex = keyToIndex.get(update.key);
    if (typeof existingIndex === "number") {
      lines[existingIndex] = nextLine;
      continue;
    }
    lines.push(nextLine);
    keyToIndex.set(update.key, lines.length - 1);
  }

  const result = lines.join("\n");
  return result.endsWith("\n") ? result : `${result}\n`;
}

async function createIndexedRegistryTopic(args: {
  network: HederaNetwork;
  operatorId: string;
  operatorKey: string;
  mirrorNodeUrl?: string;
}): Promise<string> {
  const client = new HCS2Client({
    network: args.network,
    operatorId: args.operatorId,
    operatorKey: args.operatorKey,
    mirrorNodeUrl: args.mirrorNodeUrl,
    logLevel: "warn",
    silent: true,
  });

  const response = await client.createRegistry({
    registryType: HCS2RegistryType.INDEXED,
    ttl: 86400,
  });

  if (!response.success || !response.topicId) {
    throw new Error(response.error ?? "Failed to create HCS-2 registry topic");
  }

  return response.topicId;
}

async function main() {
  dotenvFlow.config({ path: process.cwd() });

  const force = parseBooleanFlag("--force");
  const dryRun = parseBooleanFlag("--dry-run");
  const skipIfMissingCreds = parseBooleanFlag("--skip-if-missing-creds");
  const envPath = path.join(process.cwd(), ".env");
  const envLocalPath = path.join(process.cwd(), ".env.local");

  const networks = getTargetNetworks();
  const updates: Array<{ key: TargetEnvKey; value: string }> = [];

  for (const network of networks) {
    const mirrorNodeUrl = resolveMirrorNodeUrl(network);

    const keysToCreate: Array<{ scopedName: ScopedTopicKeyName; prefixedKey: PrefixedEnvKey }> = [];

    for (const scopedName of TOPIC_KEYS) {
      const prefixedKey = getPrefixedKey(network, scopedName);
      const currentValue = resolveExistingTopicValue(network, scopedName);
      const needsCreate = await shouldCreateTopic({
        currentValue,
        force,
        mirrorNodeUrl,
      });
      if (needsCreate) {
        keysToCreate.push({ scopedName, prefixedKey });
      }
    }

    if (keysToCreate.length === 0) {
      process.stdout.write(`HCS-2 registry topic IDs already set for ${network}.\n`);
      continue;
    }

    if (dryRun) {
      process.stdout.write(
        `Dry run: would create ${keysToCreate.length} HCS-2 indexed registry topics on ${network}.\n`,
      );
      keysToCreate.forEach((key) => {
        process.stdout.write(`- ${key.prefixedKey}\n`);
      });
      continue;
    }

    let operatorId: string;
    let operatorKey: string;
    try {
      ({ operatorId, operatorKey } = requireOperatorCredentials(network, dryRun));
    } catch (error) {
      if (skipIfMissingCreds) {
        const message = error instanceof Error ? error.message : String(error);
        process.stdout.write(`Skipping ${network}: ${message}\n`);
        continue;
      }
      throw error;
    }

    process.stdout.write(
      `Creating ${keysToCreate.length} HCS-2 indexed registry topics on ${network}...\n`,
    );

    for (const key of keysToCreate) {
      process.stdout.write(`- ${key.prefixedKey}: creating...\n`);
      const topicId = await createIndexedRegistryTopic({
        network,
        operatorId,
        operatorKey,
        mirrorNodeUrl,
      });

      updates.push({ key: key.prefixedKey, value: topicId });
      process.stdout.write(`  ${key.prefixedKey}=${topicId}\n`);
    }
  }

  if (dryRun) {
    return;
  }

  if (updates.length === 0) {
    process.stdout.write(
      "HCS-2 registry topic setup did not make changes.\n",
    );
    return;
  }

  const targetPaths = fs.existsSync(envLocalPath) ? [envLocalPath, envPath] : [envPath];

  for (const targetPath of targetPaths) {
    const existingFile = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : "";
    const nextFile = replaceOrAppendEnvLines(existingFile, updates);
    fs.writeFileSync(targetPath, nextFile, "utf8");
    process.stdout.write(`Updated ${targetPath}\n`);
  }

  process.stdout.write("Done.\n");
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`HCS-2 setup failed: ${message}\n`);
  process.exitCode = 1;
});
