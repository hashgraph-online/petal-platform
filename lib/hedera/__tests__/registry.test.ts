import { beforeEach, describe, expect, it, vi } from "vitest";

const mirrorModule = vi.hoisted(() => ({
  fetchTopicMessages: vi.fn(),
}));

vi.mock("@/lib/hedera/mirror", () => mirrorModule);

vi.mock("@/config/topics", () => ({
  getTopicId: () => "0.0.9001",
}));

import {
  clearRegistryCache,
  listRecentProfiles,
  primeRegistryCache,
  searchProfileByAlias,
  fetchLatestProfileForAccount,
} from "@/lib/hedera/registry";

const encodeMessage = (payload: Record<string, unknown>, sequenceNumber: number) => ({
  consensusTimestamp: `16970401${sequenceNumber}.00000000${sequenceNumber}`,
  sequenceNumber,
  message: Buffer.from(JSON.stringify(payload), "utf-8").toString("base64"),
});

describe("registry utilities", () => {
  beforeEach(() => {
    mirrorModule.fetchTopicMessages.mockReset();
    window.localStorage.clear();
    clearRegistryCache();
  });

  it("deduplicates registry messages and caches the result", async () => {
    mirrorModule.fetchTopicMessages.mockResolvedValue([
      encodeMessage({ base_account: "0.0.1", alias: "alice", display_name: "Alice" }, 1),
      encodeMessage({ base_account: "0.0.2", alias: "bob", display_name: "Bob" }, 2),
      encodeMessage({ base_account: "0.0.1", alias: "alice", display_name: "Alice new" }, 3),
    ]);

    const first = await listRecentProfiles(2);

    expect(first).toEqual([
      expect.objectContaining({ accountId: "0.0.1", alias: "alice" }),
      expect.objectContaining({ accountId: "0.0.2", alias: "bob" }),
    ]);

    mirrorModule.fetchTopicMessages.mockClear();

    const second = await listRecentProfiles(2);

    expect(second).toHaveLength(2);
    expect(mirrorModule.fetchTopicMessages).not.toHaveBeenCalled();
  });

  it("supports alias and account lookups via cache priming", async () => {
    primeRegistryCache({
      accountId: "0.0.55",
      alias: "flora",
      displayName: "Agent Flora",
      inboundTopicId: "0.0.7000",
    });

    const byAlias = await searchProfileByAlias("Flora");
    expect(byAlias).toMatchObject({ accountId: "0.0.55" });

    const byAccount = await fetchLatestProfileForAccount("0.0.55");
    expect(byAccount).toMatchObject({ alias: "flora" });

    expect(window.localStorage.length).toBeGreaterThanOrEqual(2);
  });
});
