import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const TOPIC_ID_PATTERN = /^0\.0\.\d+$/u;

const requestSchema = z.object({
  network: z.enum(["mainnet", "testnet"]),
  topics: z
    .object({
      PROFILE_REGISTRY_TOPIC_ID: z.string().regex(TOPIC_ID_PATTERN).optional(),
      FLORA_REGISTRY_TOPIC_ID: z.string().regex(TOPIC_ID_PATTERN).optional(),
      GLOBAL_PROFILE_REGISTRY_TOPIC_ID: z.string().regex(TOPIC_ID_PATTERN).optional(),
      GLOBAL_FLORA_REGISTRY_TOPIC_ID: z.string().regex(TOPIC_ID_PATTERN).optional(),
    })
    .refine((topics) => Object.values(topics).some((value) => typeof value === "string"), {
      message: "No topics provided",
    }),
});

type Network = z.infer<typeof requestSchema>["network"];
type Topics = z.infer<typeof requestSchema>["topics"];

type EnvUpdate = { key: string; value: string };
type FsModule = typeof import("node:fs");
type PathModule = typeof import("node:path");

function toNetworkPrefix(network: Network): "MAINNET" | "TESTNET" {
  return network === "mainnet" ? "MAINNET" : "TESTNET";
}

function replaceOrAppendEnvLines(source: string, updates: EnvUpdate[]): string {
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

function buildEnvUpdates(network: Network, topics: Topics): EnvUpdate[] {
  const updates: EnvUpdate[] = [];
  const prefix = toNetworkPrefix(network);

  for (const [scopedName, value] of Object.entries(topics) as Array<
    [keyof Topics, string]
  >) {
    if (!TOPIC_ID_PATTERN.test(value)) continue;
    updates.push({
      key: `NEXT_PUBLIC_${prefix}_${scopedName}`,
      value,
    });
  }

  return updates;
}

function resolveTargetPaths(fs: FsModule, path: PathModule): string[] {
  const root = process.cwd();
  const envPath = path.join(root, ".env");
  const envLocalPath = path.join(root, ".env.local");
  if (fs.existsSync(envLocalPath)) {
    return [envLocalPath, envPath];
  }
  return [envPath];
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: "Not available in production" },
      { status: 403 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues.map((issue) => issue.message).join("; "),
      },
      { status: 400 },
    );
  }

  const updates = buildEnvUpdates(parsed.data.network, parsed.data.topics);
  const fs = await import("node:fs");
  const path = await import("node:path");
  const paths = resolveTargetPaths(fs, path);

  for (const targetPath of paths) {
    const existingFile = fs.existsSync(targetPath)
      ? fs.readFileSync(targetPath, "utf8")
      : "";
    const nextFile = replaceOrAppendEnvLines(existingFile, updates);
    fs.writeFileSync(targetPath, nextFile, "utf8");
  }

  return NextResponse.json({
    success: true,
    updatedKeys: updates.map((update) => update.key),
    paths,
  });
}
