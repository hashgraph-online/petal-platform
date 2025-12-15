import { afterEach, describe, expect, it, vi } from "vitest";

const baseEnv = { ...process.env };

function resetEnv() {
  process.env = { ...baseEnv };
}

describe("topics env resolution", () => {
  afterEach(() => {
    if (typeof window !== "undefined") {
      window.localStorage.clear();
    }
    resetEnv();
    vi.resetModules();
  });

  it("prefers network-prefixed topic IDs", async () => {
    process.env.HEDERA_NETWORK = "testnet";
    process.env.NEXT_PUBLIC_WC_PROJECT_ID = "test";
    process.env.NEXT_PUBLIC_TESTNET_PROFILE_REGISTRY_TOPIC_ID = "0.0.424242";

    const { getTopicId } = await import("../topics");

    expect(getTopicId("profileRegistry", "environment", "testnet")).toBe("0.0.424242");
  });

  it("uses per-network mirror URL for explorer links", async () => {
    process.env.HEDERA_NETWORK = "testnet";
    process.env.NEXT_PUBLIC_WC_PROJECT_ID = "test";
    process.env.NEXT_PUBLIC_TESTNET_MIRROR_NODE_URL = "https://testnet.example.com/api/v1";
    process.env.NEXT_PUBLIC_MAINNET_MIRROR_NODE_URL = "https://mainnet.example.com/api/v1";
    process.env.NEXT_PUBLIC_TESTNET_PROFILE_REGISTRY_TOPIC_ID = "0.0.424242";
    process.env.NEXT_PUBLIC_TESTNET_FLORA_REGISTRY_TOPIC_ID = "0.0.424243";

    const { topicExplorerUrl } = await import("../topics");

    expect(topicExplorerUrl("0.0.1234", "mainnet")).toBe(
      "https://mainnet.example.com/api/v1/topics/0.0.1234",
    );
    expect(topicExplorerUrl("0.0.1234", "testnet")).toBe(
      "https://testnet.example.com/api/v1/topics/0.0.1234",
    );
  });

  it("respects localStorage topic overrides", async () => {
    process.env.HEDERA_NETWORK = "testnet";
    process.env.NEXT_PUBLIC_WC_PROJECT_ID = "test";
    process.env.NEXT_PUBLIC_TESTNET_PROFILE_REGISTRY_TOPIC_ID = "";

    const { setTopicOverride, tryGetTopicId } = await import("../topics");

    expect(tryGetTopicId("profileRegistry", "environment", "testnet")).toBeUndefined();

    setTopicOverride({
      name: "profileRegistry",
      scope: "environment",
      network: "testnet",
      topicId: "0.0.999999",
    });

    expect(tryGetTopicId("profileRegistry", "environment", "testnet")).toBe("0.0.999999");
  });
});
