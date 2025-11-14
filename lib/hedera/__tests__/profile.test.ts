import { describe, expect, it, beforeEach, vi } from "vitest";
import { createHash } from "crypto";
import { brotliCompressSync } from "zlib";
import type { DAppSigner } from "@hashgraph/hedera-wallet-connect";

const sdkState = vi.hoisted(() => ({
  createdTopicMemos: [] as string[],
  accountMemos: [] as string[],
  publishedMessages: [] as { topicId: string; message: string }[],
}));

const inscribeModule = vi.hoisted(() => ({
  inscribeWithSigner: vi.fn(async () => ({
    confirmed: true,
    inscription: { topic_id: "0.0.6001" },
  })),
}));

vi.mock("@hashgraph/sdk", () => {
  const state = sdkState;

  class TopicCreateTransaction {
    private memo = "";
    private transactionId: unknown;
    private nodeAccountIds: unknown;

    setTopicMemo(memo: string) {
      this.memo = memo;
      return this;
    }

    setTransactionId(id: unknown) {
      this.transactionId = id;
      return this;
    }

    setNodeAccountIds(ids: unknown) {
      this.nodeAccountIds = ids;
      return this;
    }

    freeze() {
      return this;
    }

    setAdminKey() {
      return this;
    }

    setSubmitKey() {
      return this;
    }

    freezeWith() {
      return this;
    }

    async executeWithSigner() {
      state.createdTopicMemos.push(this.memo);
      const topicId = this.memo.includes(":1") ? "0.0.5002" : "0.0.5001";
      return {
        getReceiptWithSigner: async () => ({
          topicId: {
            toString: () => topicId,
          },
        }),
      };
    }
  }

  class AccountUpdateTransaction {
    private memo = "";
    private transactionId: unknown;
    private nodeAccountIds: unknown;

    setAccountId() {
      return this;
    }

    setAccountMemo(memo: string) {
      this.memo = memo;
      return this;
    }

    setTransactionId(id: unknown) {
      this.transactionId = id;
      return this;
    }

    setNodeAccountIds(ids: unknown) {
      this.nodeAccountIds = ids;
      return this;
    }

    freeze() {
      return this;
    }

    freezeWith() {
      return this;
    }

    async executeWithSigner() {
      state.accountMemos.push(this.memo);
      return {
        getReceiptWithSigner: async () => ({}),
      };
    }
  }

  class TopicMessageSubmitTransaction {
    private topicId = "";
    private message = "";
    private transactionId: unknown;
    private nodeAccountIds: unknown;

    setTopicId(topicId: string) {
      this.topicId = topicId;
      return this;
    }

    setMessage(message: string) {
      this.message = message;
      return this;
    }

    setTransactionId(id: unknown) {
      this.transactionId = id;
      return this;
    }

    setNodeAccountIds(ids: unknown) {
      this.nodeAccountIds = ids;
      return this;
    }

    freezeWith() {
      return this;
    }

    async executeWithSigner() {
      state.publishedMessages.push({ topicId: this.topicId, message: this.message });
      return {
        getReceiptWithSigner: async () => ({
          consensusTimestamp: {
            toString: () => "1697040123.000000001",
          },
          topicSequenceNumber: {
            toNumber: () => 12,
          },
          topicRunningHash: {
            toString: () => "deadbeef",
          },
        }),
      };
    }
  }

  return {
    TopicCreateTransaction,
    AccountUpdateTransaction,
    TopicMessageSubmitTransaction,
    TopicId: {
      fromString: (value: string) => value,
    },
    AccountId: {
      fromString: (value: string) => value,
    },
    TransactionId: {
      generate: vi.fn(() => ({ id: "mock-transaction" })),
    },
  };
});

const mirrorModule = vi.hoisted(() => ({
  lookupAccount: vi.fn(),
  fetchAllTopicMessages: vi.fn(),
  fetchTopicInfo: vi.fn(),
}));

vi.mock("@/lib/hedera/mirror", () => mirrorModule);

const registryModule = vi.hoisted(() => ({
  primeRegistryCache: vi.fn(),
}));

vi.mock("@/lib/hedera/registry", () => registryModule);

const clientModule = vi.hoisted(() => ({
  getHederaClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/hedera/client", () => clientModule);

vi.mock("@/config/topics", () => ({
  getTopicId: () => "0.0.8001",
}));

vi.mock("@hashgraphonline/standards-sdk", () => inscribeModule);

import {
  createOrUpdateProfile,
  extractProfileReferenceFromMemo,
  loadProfileDocument,
  type ProfilePublishingEvent,
} from "@/lib/hedera/profile";

describe("createOrUpdateProfile", () => {
  beforeEach(() => {
    sdkState.createdTopicMemos.length = 0;
    sdkState.accountMemos.length = 0;
    sdkState.publishedMessages.length = 0;
    mirrorModule.lookupAccount.mockReset();
    mirrorModule.fetchTopicInfo.mockReset();
    mirrorModule.fetchAllTopicMessages.mockReset();
    registryModule.primeRegistryCache.mockReset();
  });

  it("creates inbox topic, updates memo, publishes payload, and primes cache", async () => {
    const expectedMemo = "hcs-11:hcs://1/0.0.6001";
    mirrorModule.lookupAccount.mockResolvedValue({ memo: expectedMemo });

    const signer = {
      getAccountKey: vi.fn().mockResolvedValue("public-key"),
      signTransaction: vi.fn(),
    } as unknown as DAppSigner;

    const result = await createOrUpdateProfile(
      {
        accountId: "0.0.1234",
        alias: "alice",
        displayName: "Alice Agent",
        avatarUrl: "https://example.com/avatar.png",
        bio: "Testing profile",
      },
      signer,
    );

    expect(result.inboundTopicId).toBe("0.0.5001");
    expect(result.outboundTopicId).toBe("0.0.5002");
    expect(result.profileTopicId).toBe("0.0.6001");
    expect(result.profileReference).toBe("hcs://1/0.0.6001");
    expect(result.accountMemo).toBe(expectedMemo);
    expect(result.accountMemoVerified).toBe(true);
    expect(result.registryReceipt.sequenceNumber).toBe(12);
    expect(result.payload).toMatchObject({
      alias: "alice",
      display_name: "Alice Agent",
      base_account: "0.0.1234",
      inboundTopicId: "0.0.5001",
      outboundTopicId: "0.0.5002",
      type: 1,
      version: "1.0",
    });
    expect(sdkState.createdTopicMemos).toEqual([
      "hcs-10:0:86400:0:0.0.1234",
      "hcs-10:0:86400:1",
    ]);
    expect(sdkState.accountMemos).toEqual([expectedMemo]);
    expect(sdkState.publishedMessages).toHaveLength(1);
    expect(sdkState.publishedMessages[0]?.topicId).toBe("0.0.8001");
    expect(JSON.parse(sdkState.publishedMessages[0]?.message ?? "{}"))
      .toMatchObject({
        standard: "hcs-11",
        accountId: "0.0.1234",
        profile_reference: "hcs://1/0.0.6001",
      });

    expect(registryModule.primeRegistryCache).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "0.0.1234",
        alias: "alice",
        inboundTopicId: "0.0.5001",
        profileReference: "hcs://1/0.0.6001",
      }),
    );

    expect(mirrorModule.lookupAccount).toHaveBeenCalledWith("0.0.1234");
    expect(inscribeModule.inscribeWithSigner).toHaveBeenCalled();
  });

  it("emits progress events for each publishing stage", async () => {
    const expectedMemo = "hcs-11:hcs://1/0.0.6001";
    mirrorModule.lookupAccount.mockResolvedValue({ memo: expectedMemo });

    const signer = {
      getAccountKey: vi.fn().mockResolvedValue("public-key"),
      signTransaction: vi.fn(),
    } as unknown as DAppSigner;

    const events: ProfilePublishingEvent[] = [];

    await createOrUpdateProfile(
      {
        accountId: "0.0.1234",
        alias: "alice",
        displayName: "Alice Agent",
        avatarUrl: "https://example.com/avatar.png",
        bio: "Testing profile",
      },
      signer,
      {
        onStep: (event) => {
          events.push(event);
        },
      },
    );

    expect(events.map((event) => `${event.type}:${event.step}`)).toEqual([
      "start:ensure-inbound",
      "success:ensure-inbound",
      "start:ensure-outbound",
      "success:ensure-outbound",
      "start:inscribe-profile",
      "success:inscribe-profile",
      "start:update-memo",
      "success:update-memo",
      "start:verify-memo",
      "success:verify-memo",
      "start:publish-registry",
      "success:publish-registry",
    ]);
  });
});

describe("profile document helpers", () => {
  it("extracts profile reference from HCS-11 memo", () => {
    expect(extractProfileReferenceFromMemo("hcs-11:hcs://1/0.0.4444")).toBe("hcs://1/0.0.4444");
    expect(extractProfileReferenceFromMemo("HCS-11:hcs://1/0.0.4444")).toBe("hcs://1/0.0.4444");
    expect(extractProfileReferenceFromMemo("memo")).toBeNull();
  });

  it("loads and validates a profile document from topic chunks", async () => {
    const profileJson = {
      version: "1.0",
      type: 1,
      display_name: "Alice Agent",
      uaid: "uaid:did:abc",
      alias: "alice",
      inboundTopicId: "0.0.5001",
      outboundTopicId: "0.0.5002",
    };
    const jsonString = JSON.stringify(profileJson);
    const bytes = Buffer.from(jsonString, "utf-8");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const dataUri = `data:application/json;base64,${bytes.toString("base64")}`;
    const chunk = {
      o: 0,
      c: dataUri,
    };
    const encodedMessage = Buffer.from(JSON.stringify(chunk), "utf-8").toString("base64");

    mirrorModule.fetchTopicInfo.mockResolvedValueOnce({
      topic_id: "0.0.6001",
      memo: `${hash}:none:base64`,
    });
    mirrorModule.fetchAllTopicMessages.mockResolvedValueOnce([
      {
        consensusTimestamp: "1697040101.000000001",
        sequenceNumber: 0,
        message: encodedMessage,
      },
    ]);

    const document = await loadProfileDocument("hcs://1/0.0.6001");

    expect(document.reference).toBe("hcs://1/0.0.6001");
    expect(document.profile.display_name).toBe("Alice Agent");
    expect(document.profile.uaid).toBe("uaid:did:abc");
    expect(document.mimeType).toBe("application/json");
    expect(document.checksumValid).toBe(true);
    expect(document.chunkCount).toBe(1);
  });

  it("supports brotli-compressed profile documents", async () => {
    const profileJson = {
      version: "1.0",
      type: 1,
      display_name: "Brotli Agent",
      uaid: "uaid:did:br",
    };
    const jsonString = JSON.stringify(profileJson);
    const bytes = Buffer.from(jsonString, "utf-8");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const compressed = brotliCompressSync(bytes);
    const base64 = Buffer.from(compressed).toString("base64");
    const chunk = {
      o: 0,
      c: `data:application/json;base64,${base64}`,
    };
    const encodedMessage = Buffer.from(JSON.stringify(chunk), "utf-8").toString("base64");

    mirrorModule.fetchTopicInfo.mockResolvedValueOnce({
      topic_id: "0.0.6002",
      memo: `${hash}:brotli:base64`,
    });
    mirrorModule.fetchAllTopicMessages.mockResolvedValueOnce([
      {
        consensusTimestamp: "1697040102.000000001",
        sequenceNumber: 0,
        message: encodedMessage,
      },
    ]);

    const document = await loadProfileDocument("hcs://1/0.0.6002");

    expect(document.reference).toBe("hcs://1/0.0.6002");
    expect(document.profile.display_name).toBe("Brotli Agent");
    expect(document.checksumValid).toBe(true);
    expect(document.compression).toBe("brotli");
  });
});
