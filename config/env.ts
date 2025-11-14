import { z } from "zod";

const topicIdRegex = /^0\.0\.[0-9]{3,}$/;

const envSchema = z
  .object({
    HEDERA_NETWORK: z
      .enum(["mainnet", "testnet", "previewnet"], {
        description: "Hedera network designation",
      })
      .default("testnet"),
    NEXT_PUBLIC_APP_URL: z
      .string()
      .url({ message: "App URL must be a valid URL" })
      .optional(),
    NEXT_PUBLIC_MIRROR_NODE_URL: z
      .string()
      .url({ message: "Mirror node URL must be a valid URL" }),
    NEXT_PUBLIC_PROFILE_REGISTRY_TOPIC_ID: z
      .string()
      .regex(topicIdRegex, "Profile registry topic must be a valid topic ID"),
    NEXT_PUBLIC_FLORA_REGISTRY_TOPIC_ID: z
      .string()
      .regex(topicIdRegex, "Flora registry topic must be a valid topic ID"),
    NEXT_PUBLIC_GLOBAL_PROFILE_REGISTRY_TOPIC_ID: z
      .string()
      .regex(topicIdRegex, "Global profile registry topic must be a valid topic ID")
      .optional(),
    NEXT_PUBLIC_GLOBAL_FLORA_REGISTRY_TOPIC_ID: z
      .string()
      .regex(topicIdRegex, "Global flora registry topic must be a valid topic ID")
      .optional(),
    WALLETCONNECT_PROJECT_ID: z.string().min(1).optional(),
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().min(1).optional(),
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
      Boolean(values.WALLETCONNECT_PROJECT_ID || values.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID),
    {
      message: "Provide WALLETCONNECT_PROJECT_ID or NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
      path: ["NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID"],
    },
  );

const runtimeEnv = {
  HEDERA_NETWORK: process.env.HEDERA_NETWORK ?? "testnet",
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_MIRROR_NODE_URL:
    process.env.NEXT_PUBLIC_MIRROR_NODE_URL ?? "https://testnet.mirrornode.hedera.com/api/v1",
  NEXT_PUBLIC_PROFILE_REGISTRY_TOPIC_ID:
    process.env.NEXT_PUBLIC_PROFILE_REGISTRY_TOPIC_ID ?? "0.0.1000",
  NEXT_PUBLIC_FLORA_REGISTRY_TOPIC_ID:
    process.env.NEXT_PUBLIC_FLORA_REGISTRY_TOPIC_ID ?? "0.0.1001",
  NEXT_PUBLIC_GLOBAL_PROFILE_REGISTRY_TOPIC_ID:
    process.env.NEXT_PUBLIC_GLOBAL_PROFILE_REGISTRY_TOPIC_ID,
  NEXT_PUBLIC_GLOBAL_FLORA_REGISTRY_TOPIC_ID:
    process.env.NEXT_PUBLIC_GLOBAL_FLORA_REGISTRY_TOPIC_ID,
  WALLETCONNECT_PROJECT_ID: process.env.WALLETCONNECT_PROJECT_ID,
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  HASHGRAPH_REGISTRY_BROKER_URL: process.env.HASHGRAPH_REGISTRY_BROKER_URL,
  NEXT_PUBLIC_DEBUG: process.env.NEXT_PUBLIC_DEBUG,
};

const parsed = envSchema.safeParse(runtimeEnv);

if (!parsed.success && typeof window === "undefined") {
  console.warn(
    "Invalid environment configuration",
    parsed.error.flatten().fieldErrors,
  );
}

const env = parsed.success
  ? parsed.data
  : (runtimeEnv as z.infer<typeof envSchema>);

export const walletConnectProjectId =
  env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? env.WALLETCONNECT_PROJECT_ID ?? "placeholder-project-id";

export const appUrl = env.NEXT_PUBLIC_APP_URL;

export { env };

export const isDevelopment = process.env.NODE_ENV !== "production";
export const isDebug = env.NEXT_PUBLIC_DEBUG === "true" || isDevelopment;

export const mirrorNodeTopicsBase = `${env.NEXT_PUBLIC_MIRROR_NODE_URL}/topics`;
