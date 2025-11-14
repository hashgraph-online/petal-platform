import { Buffer } from "buffer";
import {
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from "@hashgraph/sdk";
import type { DAppSigner } from "@hashgraph/hedera-wallet-connect";
import { getHederaClient } from "@/lib/hedera/client";
import { sendDirectMessage, type DirectMessagePayload } from "@/lib/hedera/messaging";

export type FloraTopics = {
  communication: string;
  transaction: string;
  state: string;
};

export type FloraCreateRequestPayload = DirectMessagePayload & {
  type: "flora_create_request";
  flora: {
    name: string;
    communicationTopicId: string;
    transactionTopicId: string;
    stateTopicId: string;
    initiator: {
      accountId: string;
      alias?: string;
    };
    members: Array<{
      accountId: string;
      alias?: string;
    }>;
  };
};

export type FloraJoinAcceptPayload = DirectMessagePayload & {
  type: "flora_join_accept";
  floraId: string;
};

export type FloraCreatedPayload = DirectMessagePayload & {
  type: "flora_created";
  floraId: string;
};

export type FloraChatMessage = {
  type: "flora_chat";
  from: string;
  content: string;
  sentAt: string;
};

export type FloraProposalMessage = {
  type: "flora_proposal";
  proposalId: string;
  from: string;
  text: string;
  sentAt: string;
};

export type FloraStateMessage = {
  type: "flora_state";
  from: string;
  summary: string;
  sentAt: string;
  stateHash?: string | null; // TODO: integrate HCS-17 state hashing when available
};

export type FloraVoteMessage = {
  type: "flora_vote";
  proposalId: string;
  from: string;
  vote: "yes" | "no";
  sentAt: string;
};

function encodePayload(payload: unknown): string {
  return Buffer.from(JSON.stringify(payload), "utf-8").toString("base64");
}

function floraTopicMemo(name: string, suffix: string): string {
  const memo = `Flora:${name}-${suffix}`;
  return memo.slice(0, 100);
}

export async function createFloraTopics(
  signer: DAppSigner,
  name: string,
): Promise<FloraTopics> {
  const client = getHederaClient();

  const communicationTx = await new TopicCreateTransaction()
    .setTopicMemo(floraTopicMemo(name, "Comm"))
    .freezeWith(client);
  await signer.signTransaction(communicationTx);
  const communicationResponse = await communicationTx.executeWithSigner(signer);
  const communicationReceipt = await communicationResponse.getReceiptWithSigner(signer);
  const communication = communicationReceipt.topicId?.toString();
  if (!communication) {
    throw new Error("Failed to create flora communication topic");
  }

  const transactionTx = await new TopicCreateTransaction()
    .setTopicMemo(floraTopicMemo(name, "Tx"))
    .freezeWith(client);
  await signer.signTransaction(transactionTx);
  const transactionResponse = await transactionTx.executeWithSigner(signer);
  const transactionReceipt = await transactionResponse.getReceiptWithSigner(signer);
  const transaction = transactionReceipt.topicId?.toString();
  if (!transaction) {
    throw new Error("Failed to create flora transaction topic");
  }

  const stateTx = await new TopicCreateTransaction()
    .setTopicMemo(floraTopicMemo(name, "State"))
    .freezeWith(client);
  await signer.signTransaction(stateTx);
  const stateResponse = await stateTx.executeWithSigner(signer);
  const stateReceipt = await stateResponse.getReceiptWithSigner(signer);
  const state = stateReceipt.topicId?.toString();
  if (!state) {
    throw new Error("Failed to create flora state topic");
  }

  return {
    communication,
    transaction,
    state,
  };
}

export async function sendFloraCreateRequest(
  signer: DAppSigner,
  inviteeTopicId: string,
  payload: FloraCreateRequestPayload,
): Promise<void> {
  await sendDirectMessage(signer, inviteeTopicId, payload);
}

export async function announceFloraOnCommunicationTopic(
  signer: DAppSigner,
  communicationTopicId: string,
  payload: FloraCreateRequestPayload,
): Promise<void> {
  const client = getHederaClient();
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(communicationTopicId)
    .setMessage(encodePayload(payload))
    .freezeWith(client);
  await signer.signTransaction(tx);
  const response = await tx.executeWithSigner(signer);
  await response.getReceiptWithSigner(signer);
}

export async function sendFloraJoinAccept(
  signer: DAppSigner,
  communicationTopicId: string,
  payload: FloraJoinAcceptPayload,
): Promise<void> {
  const client = getHederaClient();
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(communicationTopicId)
    .setMessage(encodePayload(payload))
    .freezeWith(client);
  await signer.signTransaction(tx);
  const response = await tx.executeWithSigner(signer);
  await response.getReceiptWithSigner(signer);
}

export async function sendFloraCreated(
  signer: DAppSigner,
  communicationTopicId: string,
  payload: FloraCreatedPayload,
): Promise<void> {
  const client = getHederaClient();
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(communicationTopicId)
    .setMessage(encodePayload(payload))
    .freezeWith(client);
  await signer.signTransaction(tx);
  const response = await tx.executeWithSigner(signer);
  await response.getReceiptWithSigner(signer);
}

export async function sendFloraChat(
  signer: DAppSigner,
  communicationTopicId: string,
  payload: FloraChatMessage,
): Promise<void> {
  const client = getHederaClient();
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(communicationTopicId)
    .setMessage(encodePayload(payload))
    .freezeWith(client);
  await signer.signTransaction(tx);
  const response = await tx.executeWithSigner(signer);
  await response.getReceiptWithSigner(signer);
}

export async function sendFloraProposal(
  signer: DAppSigner,
  transactionTopicId: string,
  payload: FloraProposalMessage,
): Promise<void> {
  const client = getHederaClient();
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(transactionTopicId)
    .setMessage(encodePayload(payload))
    .freezeWith(client);
  await signer.signTransaction(tx);
  const response = await tx.executeWithSigner(signer);
  await response.getReceiptWithSigner(signer);
}

export async function sendFloraStateUpdate(
  signer: DAppSigner,
  stateTopicId: string,
  payload: FloraStateMessage,
): Promise<void> {
  const client = getHederaClient();
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(stateTopicId)
    .setMessage(encodePayload(payload))
    .freezeWith(client);
  await signer.signTransaction(tx);
  const response = await tx.executeWithSigner(signer);
  await response.getReceiptWithSigner(signer);
}

export async function sendFloraVote(
  signer: DAppSigner,
  transactionTopicId: string,
  payload: FloraVoteMessage,
): Promise<void> {
  const client = getHederaClient();
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(transactionTopicId)
    .setMessage(encodePayload(payload))
    .freezeWith(client);
  await signer.signTransaction(tx);
  const response = await tx.executeWithSigner(signer);
  await response.getReceiptWithSigner(signer);
}
