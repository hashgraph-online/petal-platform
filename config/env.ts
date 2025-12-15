import { z } from "zod";

const topicIdRegex = /^0\.0\.[0-9]{3,}$/;

function emptyToUndefined(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

const envSchema = z
  .object({
    HEDERA_NETWORK: z
      .enum(["mainnet", "testnet", "previewnet"], {
        description: "Hedera network designation",
      })
      .default("testnet"),
    NEXT_PUBLIC_TESTNET_MIRROR_NODE_URL: z
      .string()
      .url({ message: "Testnet mirror node URL must be a valid URL" })
      .optional(),
    NEXT_PUBLIC_MAINNET_MIRROR_NODE_URL: z
      .string()
      .url({ message: "Mainnet mirror node URL must be a valid URL" })
      .optional(),
    NEXT_PUBLIC_APP_URL: z
      .string()
      .url({ message: "App URL must be a valid URL" })
      .optional(),
    NEXT_PUBLIC_MIRROR_NODE_URL: z
      .string()
      .url({ message: "Mirror node URL must be a valid URL" }),
    NEXT_PUBLIC_TESTNET_PROFILE_REGISTRY_TOPIC_ID: z
      .string()
      .regex(topicIdRegex, "Testnet profile registry topic must be a valid topic ID")
      .optional(),
    NEXT_PUBLIC_MAINNET_PROFILE_REGISTRY_TOPIC_ID: z
      .string()
      .regex(topicIdRegex, "Mainnet profile registry topic must be a valid topic ID")
      .optional(),
    NEXT_PUBLIC_TESTNET_FLORA_REGISTRY_TOPIC_ID: z
      .string()
      .regex(topicIdRegex, "Testnet flora registry topic must be a valid topic ID")
      .optional(),
    NEXT_PUBLIC_MAINNET_FLORA_REGISTRY_TOPIC_ID: z
      .string()
      .regex(topicIdRegex, "Mainnet flora registry topic must be a valid topic ID")
      .optional(),
    NEXT_PUBLIC_TESTNET_GLOBAL_PROFILE_REGISTRY_TOPIC_ID: z
      .string()
      .regex(topicIdRegex, "Testnet global profile registry topic must be a valid topic ID")
      .optional(),
    NEXT_PUBLIC_MAINNET_GLOBAL_PROFILE_REGISTRY_TOPIC_ID: z
      .string()
      .regex(topicIdRegex, "Mainnet global profile registry topic must be a valid topic ID")
      .optional(),
    NEXT_PUBLIC_TESTNET_GLOBAL_FLORA_REGISTRY_TOPIC_ID: z
      .string()
      .regex(topicIdRegex, "Testnet global flora registry topic must be a valid topic ID")
      .optional(),
    NEXT_PUBLIC_MAINNET_GLOBAL_FLORA_REGISTRY_TOPIC_ID: z
      .string()
      .regex(topicIdRegex, "Mainnet global flora registry topic must be a valid topic ID")
      .optional(),
    WALLETCONNECT_PROJECT_ID: z.string().min(1).optional(),
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().min(1).optional(),
    NEXT_PUBLIC_WC_PROJECT_ID: z.string().min(1).optional(),
    HASHGRAPH_REGISTRY_BROKER_URL: z
      .string()
      .url({ message: "Registry broker URL must be a valid URL" })
      .optional(),
    NEXT_PUBLIC_DEBUG: z
      .enum(["true", "false"], {
        description: "Enable verbose debug logging",
      })
      .optional(),
  })
  .refine(
    (values) =>
      Boolean(
        values.NEXT_PUBLIC_WC_PROJECT_ID ||
          values.WALLETCONNECT_PROJECT_ID ||
          values.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
      ),
    {
      message:
        "Provide NEXT_PUBLIC_WC_PROJECT_ID, WALLETCONNECT_PROJECT_ID, or NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
      path: ["NEXT_PUBLIC_WC_PROJECT_ID"],
    },
  );

const runtimeEnv = {
  HEDERA_NETWORK: emptyToUndefined(process.env.HEDERA_NETWORK) ?? "testnet",
  NEXT_PUBLIC_TESTNET_MIRROR_NODE_URL: emptyToUndefined(
    process.env.NEXT_PUBLIC_TESTNET_MIRROR_NODE_URL,
  ),
  NEXT_PUBLIC_MAINNET_MIRROR_NODE_URL: emptyToUndefined(
    process.env.NEXT_PUBLIC_MAINNET_MIRROR_NODE_URL,
  ),
  NEXT_PUBLIC_APP_URL: emptyToUndefined(process.env.NEXT_PUBLIC_APP_URL),
  NEXT_PUBLIC_MIRROR_NODE_URL: emptyToUndefined(process.env.NEXT_PUBLIC_MIRROR_NODE_URL),
  NEXT_PUBLIC_TESTNET_PROFILE_REGISTRY_TOPIC_ID: emptyToUndefined(
    process.env.NEXT_PUBLIC_TESTNET_PROFILE_REGISTRY_TOPIC_ID,
  ),
  NEXT_PUBLIC_MAINNET_PROFILE_REGISTRY_TOPIC_ID: emptyToUndefined(
    process.env.NEXT_PUBLIC_MAINNET_PROFILE_REGISTRY_TOPIC_ID,
  ),
  NEXT_PUBLIC_TESTNET_FLORA_REGISTRY_TOPIC_ID: emptyToUndefined(
    process.env.NEXT_PUBLIC_TESTNET_FLORA_REGISTRY_TOPIC_ID,
  ),
  NEXT_PUBLIC_MAINNET_FLORA_REGISTRY_TOPIC_ID: emptyToUndefined(
    process.env.NEXT_PUBLIC_MAINNET_FLORA_REGISTRY_TOPIC_ID,
  ),
  NEXT_PUBLIC_TESTNET_GLOBAL_PROFILE_REGISTRY_TOPIC_ID: emptyToUndefined(
    process.env.NEXT_PUBLIC_TESTNET_GLOBAL_PROFILE_REGISTRY_TOPIC_ID,
  ),
  NEXT_PUBLIC_MAINNET_GLOBAL_PROFILE_REGISTRY_TOPIC_ID: emptyToUndefined(
    process.env.NEXT_PUBLIC_MAINNET_GLOBAL_PROFILE_REGISTRY_TOPIC_ID,
  ),
  NEXT_PUBLIC_TESTNET_GLOBAL_FLORA_REGISTRY_TOPIC_ID: emptyToUndefined(
    process.env.NEXT_PUBLIC_TESTNET_GLOBAL_FLORA_REGISTRY_TOPIC_ID,
  ),
  NEXT_PUBLIC_MAINNET_GLOBAL_FLORA_REGISTRY_TOPIC_ID: emptyToUndefined(
    process.env.NEXT_PUBLIC_MAINNET_GLOBAL_FLORA_REGISTRY_TOPIC_ID,
  ),
  WALLETCONNECT_PROJECT_ID: emptyToUndefined(process.env.WALLETCONNECT_PROJECT_ID),
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: emptyToUndefined(
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  ),
  NEXT_PUBLIC_WC_PROJECT_ID:
    emptyToUndefined(process.env.NEXT_PUBLIC_WC_PROJECT_ID) ??
    "55632c02cb971468424ae93c89366117",
  HASHGRAPH_REGISTRY_BROKER_URL: emptyToUndefined(process.env.HASHGRAPH_REGISTRY_BROKER_URL),
  NEXT_PUBLIC_DEBUG: emptyToUndefined(process.env.NEXT_PUBLIC_DEBUG),
};

const resolvedNetwork =
  runtimeEnv.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet";

const resolvedMirrorNodeUrl =
  resolvedNetwork === "mainnet"
    ? runtimeEnv.NEXT_PUBLIC_MAINNET_MIRROR_NODE_URL ?? runtimeEnv.NEXT_PUBLIC_MIRROR_NODE_URL
    : runtimeEnv.NEXT_PUBLIC_TESTNET_MIRROR_NODE_URL ?? runtimeEnv.NEXT_PUBLIC_MIRROR_NODE_URL;

runtimeEnv.NEXT_PUBLIC_MIRROR_NODE_URL =
  resolvedMirrorNodeUrl ?? "https://testnet.mirrornode.hedera.com/api/v1";

const parsed = envSchema.safeParse(runtimeEnv);

const env = parsed.success
  ? parsed.data
  : (runtimeEnv as z.infer<typeof envSchema>);

export const walletConnectProjectId =
  env.NEXT_PUBLIC_WC_PROJECT_ID ??
  env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ??
  env.WALLETCONNECT_PROJECT_ID ??
  "55632c02cb971468424ae93c89366117";

export const appUrl = env.NEXT_PUBLIC_APP_URL;

export { env };

export const isDevelopment = process.env.NODE_ENV !== "production";
export const isDebug = env.NEXT_PUBLIC_DEBUG === "true" || isDevelopment;

export function getMirrorNodeUrl(network: "mainnet" | "testnet"): string {
  if (network === "mainnet") {
    return env.NEXT_PUBLIC_MAINNET_MIRROR_NODE_URL ?? env.NEXT_PUBLIC_MIRROR_NODE_URL;
  }
  return env.NEXT_PUBLIC_TESTNET_MIRROR_NODE_URL ?? env.NEXT_PUBLIC_MIRROR_NODE_URL;
}

export const mirrorNodeTopicsBase = `${env.NEXT_PUBLIC_MIRROR_NODE_URL}/topics`;
