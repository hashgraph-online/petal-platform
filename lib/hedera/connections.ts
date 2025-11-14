import {
  AccountId,
  KeyList,
  PublicKey,
  TopicCreateTransaction,
  TransactionId,
} from "@hashgraph/sdk";
import type { DAppSigner } from "@hashgraph/hedera-wallet-connect";
import { getHederaClient } from "@/lib/hedera/client";
import { lookupAccount } from "@/lib/hedera/mirror";
import { getSignerPublicKey, publicKeyFromMirrorKey } from "@/lib/hedera/keys";
import {
  recordOutboundConnectionCreated,
  sendConnectionCreatedNotification,
  type Hcs10Operator,
} from "@/lib/hedera/messaging";

const CONNECTION_TOPIC_TTL_SECONDS = 86_400;

export type ConnectionRequestContext = {
  signer: DAppSigner;
  localAccountId: string;
  localInboundTopicId: string;
  localOutboundTopicId: string;
  remoteAccountId: string;
  remoteInboundTopicId: string;
  requestSequenceNumber: number;
  requestorOutboundTopicId?: string;
  memo?: string;
};

export type ConnectionRecord = {
  connectionTopicId: string;
  contactAccountId: string;
  contactAlias?: string;
  contactDisplayName?: string;
  contactInboundTopicId: string;
  connectionId: number;
  createdAt: string;
};

async function buildSubmitKey(
  localKey: PublicKey,
  remoteKey: PublicKey,
): Promise<KeyList> {
  const keyList = new KeyList();
  keyList.push(localKey, remoteKey);
  keyList.setThreshold(1);
  return keyList;
}

function buildConnectionMemo(
  localInboundTopicId: string,
  connectionId: number,
): string {
  return `hcs-10:1:${CONNECTION_TOPIC_TTL_SECONDS}:2:${localInboundTopicId}:${connectionId}`;
}

export async function createConnectionTopic(
  context: ConnectionRequestContext,
): Promise<string> {
  const {
    signer,
    localAccountId,
    localInboundTopicId,
    localOutboundTopicId,
    remoteAccountId,
    requestSequenceNumber,
    memo,
    requestorOutboundTopicId,
  } = context;

  const client = getHederaClient();
  const localPublicKey = await getSignerPublicKey(signer, localAccountId);
  if (!localPublicKey) {
    throw new Error("Unable to derive signer public key for connection topic");
  }

  const remoteAccount = await lookupAccount(remoteAccountId);
  const remotePublicKey = publicKeyFromMirrorKey(remoteAccount?.key);
  if (!remotePublicKey) {
    throw new Error("Remote account public key unavailable for connection topic");
  }

  const submitKey = await buildSubmitKey(localPublicKey, remotePublicKey);
  const transaction = new TopicCreateTransaction()
    .setTopicMemo(buildConnectionMemo(localInboundTopicId, requestSequenceNumber))
    .setSubmitKey(submitKey)
    .setAdminKey(localPublicKey)
    .setTransactionId(TransactionId.generate(AccountId.fromString(localAccountId)));

  await transaction.freezeWith(client);
  await signer.signTransaction(transaction);
  const response = await transaction.executeWithSigner(signer);
  const receipt = await response.getReceiptWithSigner(signer);

  const topicId = receipt.topicId?.toString();
  if (!topicId) {
    throw new Error("Connection topic creation did not return a topic ID");
  }

  const operator: Hcs10Operator = {
    inboundTopicId: context.localInboundTopicId,
    accountId: localAccountId,
  };

  const confirmation = await sendConnectionCreatedNotification(
    signer,
    context.remoteInboundTopicId,
    topicId,
    context.remoteAccountId,
    operator,
    context.requestSequenceNumber,
    memo,
  );

  await recordOutboundConnectionCreated({
    signer,
    outboundTopicId: localOutboundTopicId,
    operator,
    connectionTopicId: topicId,
    requestSequenceNumber,
    confirmationSequenceNumber: confirmation.sequenceNumber,
    requestorOutboundTopicId,
    connectedAccountId: context.remoteAccountId,
    memo,
  });

  return topicId;
}
