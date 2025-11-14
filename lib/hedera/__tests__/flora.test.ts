import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DAppSigner } from "@hashgraph/hedera-wallet-connect";

const sdkState = vi.hoisted(() => ({
  topicMemos: [] as string[],
  submittedMessages: [] as { topicId: string; message: string }[],
}));

vi.mock("@hashgraph/sdk", () => {
  const state = sdkState;

  class TopicCreateTransaction {
    private memo = "";
    private responseTopic = "";

    setTopicMemo(memo: string) {
      this.memo = memo;
      return this;
    }

    freezeWith() {
      return this;
    }

    async executeWithSigner() {
      state.topicMemos.push(this.memo);
      const suffix = this.memo.split("-").pop() ?? "Comm";
      this.responseTopic = `0.0.6${suffix.length}01`;
      return {
        getReceiptWithSigner: async () => ({
          topicId: {
            toString: () => this.responseTopic,
          },
        }),
      };
    }
  }

  class TopicMessageSubmitTransaction {
    private topicId = "";
    private message = "";

    setTopicId(topicId: string) {
      this.topicId = topicId;
      return this;
    }

    setMessage(message: string) {
      this.message = message;
      return this;
    }

    freezeWith() {
      return this;
    }

    async executeWithSigner() {
      state.submittedMessages.push({ topicId: this.topicId, message: this.message });
      return {
        getReceiptWithSigner: async () => ({}),
      };
    }
  }

  return {
    TopicCreateTransaction,
    TopicMessageSubmitTransaction,
  };
});

const messagingModule = vi.hoisted(() => ({
  sendDirectMessage: vi.fn(),
}));

vi.mock("@/lib/hedera/messaging", () => messagingModule);

const clientModule = vi.hoisted(() => ({
  getHederaClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/hedera/client", () => clientModule);

import {
  announceFloraOnCommunicationTopic,
  createFloraTopics,
  sendFloraCreateRequest,
  sendFloraJoinAccept,
  sendFloraCreated,
  sendFloraChat,
  sendFloraProposal,
  sendFloraStateUpdate,
  sendFloraVote,
} from "@/lib/hedera/flora";

describe("flora helpers", () => {
  beforeEach(() => {
    sdkState.topicMemos.length = 0;
    sdkState.submittedMessages.length = 0;
    messagingModule.sendDirectMessage.mockReset();
  });

  it("creates flora topics with memo structure", async () => {
    const signTransaction = vi.fn();
    const signer = {
      signTransaction,
    } as unknown as DAppSigner;
    const topics = await createFloraTopics(signer, "Bloom");

    expect(topics.communication).toMatch(/^0\.0\.6/);
    expect(topics.transaction).toMatch(/^0\.0\.6/);
    expect(topics.state).toMatch(/^0\.0\.6/);
    expect(sdkState.topicMemos).toEqual([
      "Flora:Bloom-Comm",
      "Flora:Bloom-Tx",
      "Flora:Bloom-State",
    ]);
    expect(signTransaction).toHaveBeenCalledTimes(3);
  });

  it("delegates flora create requests to direct messaging", async () => {
    const signer = {} as DAppSigner;
    const payload = {
      type: "flora_create_request" as const,
      from: "0.0.1",
      to: "0.0.2",
      content: "",
      sentAt: new Date().toISOString(),
      flora: {
        name: "Bloom",
        communicationTopicId: "0.0.6001",
        transactionTopicId: "0.0.6002",
        stateTopicId: "0.0.6003",
        initiator: { accountId: "0.0.1" },
        members: [{ accountId: "0.0.2" }],
      },
    };

    await sendFloraCreateRequest(signer, "0.0.123", payload);

    expect(messagingModule.sendDirectMessage).toHaveBeenCalledWith(
      signer,
      "0.0.123",
      payload,
    );
  });

  it("announces flora lifecycle messages via topics", async () => {
    const signer = {
      signTransaction: vi.fn(),
    } as unknown as DAppSigner;

    await announceFloraOnCommunicationTopic(signer, "0.0.6001", {
      type: "flora_create_request",
      from: "0.0.1",
      to: "0.0.2",
      content: "announce",
      sentAt: new Date().toISOString(),
      flora: {
        name: "Bloom",
        communicationTopicId: "0.0.6001",
        transactionTopicId: "0.0.6002",
        stateTopicId: "0.0.6003",
        initiator: { accountId: "0.0.1" },
        members: [{ accountId: "0.0.2" }],
      },
    });

    await sendFloraJoinAccept(signer, "0.0.6001", {
      type: "flora_join_accept",
      from: "0.0.2",
      to: "0.0.1",
      content: "",
      sentAt: new Date().toISOString(),
      floraId: "0.0.6001",
    });

    await sendFloraCreated(signer, "0.0.6001", {
      type: "flora_created",
      from: "0.0.1",
      to: "0.0.2",
      content: "",
      sentAt: new Date().toISOString(),
      floraId: "0.0.6001",
    });

    await sendFloraChat(signer, "0.0.6001", {
      type: "flora_chat",
      from: "0.0.1",
      content: "hello",
      sentAt: new Date().toISOString(),
    });

    await sendFloraProposal(signer, "0.0.6002", {
      type: "flora_proposal",
      proposalId: "proposal-1",
      from: "0.0.1",
      text: "Test",
      sentAt: new Date().toISOString(),
    });

    await sendFloraStateUpdate(signer, "0.0.6003", {
      type: "flora_state",
      from: "0.0.1",
      summary: "State",
      sentAt: new Date().toISOString(),
      stateHash: null,
    });

    await sendFloraVote(signer, "0.0.6002", {
      type: "flora_vote",
      from: "0.0.2",
      proposalId: "proposal-1",
      vote: "yes",
      sentAt: new Date().toISOString(),
    });

    expect(sdkState.submittedMessages).toHaveLength(7);
    expect(signer.signTransaction).toHaveBeenCalledTimes(7);

    const decodedFirst = JSON.parse(
      Buffer.from(sdkState.submittedMessages[0]?.message ?? "", "base64").toString(
        "utf-8",
      ),
    );
    expect(decodedFirst.type).toBe("flora_create_request");
  });
});
