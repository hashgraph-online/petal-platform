import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DAppSigner } from "@hashgraph/hedera-wallet-connect";

const sdkState = vi.hoisted(() => ({
  submittedMessages: [] as { topicId: string; message: string; memo?: string }[],
  sequence: 1,
}));

vi.mock("@hashgraph/sdk", () => {
  const state = sdkState;

  class TopicMessageSubmitTransaction {
    private topicId = "";
    private message = "";
    private memo: string | undefined;

    setTopicId(topicId: string) {
      this.topicId = topicId;
      return this;
    }

    setMessage(message: string) {
      this.message = message;
      return this;
    }

    setTransactionMemo(memo: string) {
      this.memo = memo;
      return this;
    }

    freezeWith() {
      return this;
    }

    async executeWithSigner() {
      const sequenceNumber = sdkState.sequence++;
      state.submittedMessages.push({
        topicId: this.topicId,
        message: this.message,
        memo: this.memo,
      });
      return {
        getReceiptWithSigner: async () => ({
          topicSequenceNumber: { toNumber: () => sequenceNumber },
          consensusTimestamp: { toString: () => `16970401${sequenceNumber}.000000001` },
        }),
      };
    }
  }

  return {
    TopicMessageSubmitTransaction,
    TopicId: {
      fromString: (value: string) => value,
    },
  };
});

const mirrorModule = vi.hoisted(() => ({
  fetchTopicMessages: vi.fn(),
  subscribeTopicWebsocket: vi.fn(),
}));

vi.mock("@/lib/hedera/mirror", () => mirrorModule);

const clientModule = vi.hoisted(() => ({
  getHederaClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/hedera/client", () => clientModule);

import {
  fetchInboxEvents,
  sendDirectMessage,
  sendConnectionRequest,
  subscribeInbox,
} from "@/lib/hedera/messaging";

describe("messaging helpers", () => {
  beforeEach(() => {
    sdkState.submittedMessages.length = 0;
    sdkState.sequence = 1;
    mirrorModule.fetchTopicMessages.mockReset();
    mirrorModule.subscribeTopicWebsocket.mockReset();
  });

  it("fetches, decodes, filters, and sorts inbox messages", async () => {
    const payload = (data: object) =>
      Buffer.from(JSON.stringify(data), "utf-8").toString("base64");

    mirrorModule.fetchTopicMessages.mockResolvedValue([
      {
        consensusTimestamp: "1697040101.000000001",
        sequenceNumber: 1,
        message: payload({
          type: "text",
          from: "0.0.1",
          to: "0.0.2",
          content: "hello",
          sentAt: "2023-10-11T10:00:00Z",
        }),
      },
      {
        consensusTimestamp: "1697040100.000000001",
        sequenceNumber: 2,
        message: "invalid",
      },
      {
        consensusTimestamp: "1697040102.000000001",
        sequenceNumber: 3,
        message: payload({
          type: "text",
          from: "0.0.3",
          to: "0.0.2",
          content: "hi there",
          sentAt: "2023-10-11T10:01:00Z",
        }),
      },
    ]);

    const events = await fetchInboxEvents("0.0.9001");

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      kind: "direct-message",
      message: expect.objectContaining({ content: "hello", sequenceNumber: 1 }),
    });
    expect(events[1]).toEqual({
      kind: "direct-message",
      message: expect.objectContaining({ content: "hi there", sequenceNumber: 3 }),
    });
  });

  it("subscribes to websocket messages and filters invalid payloads", () => {
    const callbacks: Array<(message: unknown) => void> = [];
    mirrorModule.subscribeTopicWebsocket.mockImplementation((_, callback) => {
      callbacks.push(callback);
      return () => {
        callbacks.length = 0;
      };
    });

    const received: unknown[] = [];
    const unsubscribe = subscribeInbox("0.0.9001", (event) => received.push(event));

    const validMessage = {
      consensusTimestamp: "1697040105.000000001",
      sequenceNumber: 4,
      message: Buffer.from(
        JSON.stringify({
          type: "text",
          from: "0.0.1",
          to: "0.0.2",
          content: "hey",
          sentAt: "2023-10-11T10:02:00Z",
        }),
        "utf-8",
      ).toString("base64"),
    };

    callbacks.forEach((callback) => callback(validMessage));
    callbacks.forEach((callback) => callback({ message: "bad" }));

    expect(received).toEqual([
      {
        kind: "direct-message",
        message: expect.objectContaining({ content: "hey", sequenceNumber: 4 }),
      },
    ]);

    unsubscribe();
    expect(callbacks).toHaveLength(0);
  });

  it("encodes payloads and signs direct messages", async () => {
    const signer = {
      signTransaction: vi.fn(),
    } as unknown as DAppSigner;

    await sendDirectMessage(signer, "0.0.9001", {
      type: "text",
      from: "0.0.1",
      to: "0.0.2",
      content: "Ping",
      sentAt: "2023-10-11T10:03:00Z",
    });

    expect(signer.signTransaction).toHaveBeenCalledTimes(1);
    expect(sdkState.submittedMessages[0]?.topicId).toBe("0.0.9001");
    expect(() =>
      JSON.parse(
        Buffer.from(sdkState.submittedMessages[0]?.message ?? "", "base64").toString("utf-8"),
      ),
    ).not.toThrow();
  });

  it("sends connection requests and records outbound logs", async () => {
    const signer = {
      signTransaction: vi.fn(async (tx) => tx),
    } as unknown as DAppSigner;

    const result = await sendConnectionRequest({
      signer,
      localAccountId: "0.0.200",
      localInboundTopicId: "0.0.320",
      localOutboundTopicId: "0.0.330",
      remoteAccountId: "0.0.111",
      remoteInboundTopicId: "0.0.440",
      memo: "Testing",
    });

    expect(result.requestSequenceNumber).toBeDefined();
    expect(sdkState.submittedMessages).toHaveLength(2);
    expect(sdkState.submittedMessages[0]?.topicId).toBe("0.0.440");
    expect(sdkState.submittedMessages[0]?.memo).toBe("hcs-10:op:3:1");
    expect(sdkState.submittedMessages[1]?.topicId).toBe("0.0.330");
    expect(sdkState.submittedMessages[1]?.memo).toBe("hcs-10:op:3:2");
  });
});
