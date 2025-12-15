import { Buffer } from "buffer";
import {
  AccountId,
  TransactionId,
} from "@hashgraph/sdk";
import type { DAppSigner } from "@/lib/hedera/wallet-types";
import type { TopicMessageSubmitTransaction } from "@hashgraph/sdk";
import {
  buildHcs10ConfirmConnectionTx,
  buildHcs10OutboundConnectionCreatedRecordTx,
  buildHcs10OutboundConnectionRequestRecordTx,
  buildHcs10SendMessageTx,
  buildHcs10SubmitConnectionRequestTx,
  buildHcs20SubmitMessageTx,
} from "@hashgraphonline/standards-sdk";
import { getHederaClient } from "@/lib/hedera/client";
import {
  fetchTopicMessages,
  subscribeTopicWebsocket,
  type MirrorTopicMessage,
} from "@/lib/hedera/mirror";

export type DirectMessagePayload = {
  type: "text" | string;
  from: string;
  to: string;
  content: string;
  sentAt: string;
};

export type DirectMessage = DirectMessagePayload & {
  consensusTimestamp: string;
  sequenceNumber: number;
};

export type Hcs10Operator = {
  inboundTopicId: string;
  accountId: string;
};

export type ConnectionRequestEvent = {
  kind: "connection-request";
  sequenceNumber: number;
  consensusTimestamp: string;
  operator: Hcs10Operator | null;
  memo?: string;
  requestorOutboundTopicId?: string | null;
  requestorAlias?: string;
  requestorDisplayName?: string;
  note?: string;
  raw: Record<string, unknown>;
};

export type ConnectionCreatedEvent = {
  kind: "connection-created";
  sequenceNumber: number;
  consensusTimestamp: string;
  operator: Hcs10Operator | null;
  connectionTopicId: string | null;
  connectedAccountId: string | null;
  connectionId: number | null;
  outboundTopicId?: string | null;
  requestorOutboundTopicId?: string | null;
  confirmedRequestId?: number | null;
  memo?: string;
  raw: Record<string, unknown>;
};

export type InboxEvent =
  | { kind: "direct-message"; message: DirectMessage }
  | ConnectionRequestEvent
  | ConnectionCreatedEvent;

export type ConnectionTopicMessage = {
  consensusTimestamp: string;
  sequenceNumber: number;
  operator: Hcs10Operator | null;
  data?: string;
  memo?: string;
  raw: Record<string, unknown>;
};

async function submitMessageTransaction(
  signer: DAppSigner,
  transaction: TopicMessageSubmitTransaction,
  payerAccountId?: string,
): Promise<SubmittedMessageResult> {
  const client = getHederaClient();

  if (payerAccountId) {
    transaction.setTransactionId(
      TransactionId.generate(AccountId.fromString(payerAccountId)),
    );
  }

  await transaction.freezeWith(client);
  await signer.signTransaction(transaction);
  const response = await transaction.executeWithSigner(signer);
  const receipt = await response.getReceiptWithSigner(signer);

  const enriched = receipt as {
    consensusTimestamp?: { toString: () => string };
    topicSequenceNumber?: { toNumber: () => number };
    topicRunningHash?: { toString: (encoding?: string) => string };
  };

  return {
    consensusTimestamp: enriched.consensusTimestamp?.toString(),
    sequenceNumber: enriched.topicSequenceNumber?.toNumber(),
    runningHash: enriched.topicRunningHash?.toString("hex"),
  };
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function maybeDecodeBase64(raw: string): string | null {
  const sanitized = raw.trim();
  if (!sanitized || sanitized.length % 4 !== 0) {
    return null;
  }
  if (!/^[A-Za-z0-9+/=]+$/.test(sanitized)) {
    return null;
  }
  try {
    return Buffer.from(sanitized, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

function decodeJson(message: MirrorTopicMessage): Record<string, unknown> | null {
  if (!message.message) {
    return null;
  }

  const firstPass = Buffer.from(message.message, "base64").toString("utf-8");
  const parsed = tryParseJson(firstPass);
  if (parsed) {
    return parsed;
  }

  const nested = maybeDecodeBase64(firstPass);
  if (nested) {
    const nestedParsed = tryParseJson(nested);
    if (nestedParsed) {
      return nestedParsed;
    }
  }

  return null;
}

function decodeDirectMessage(message: MirrorTopicMessage): DirectMessage | null {
  const parsed = decodeJson(message) as DirectMessagePayload | null;
  if (!parsed || !parsed.from || !parsed.to || !parsed.sentAt) {
    return null;
  }
  return {
    ...parsed,
    consensusTimestamp: message.consensusTimestamp,
    sequenceNumber: message.sequenceNumber,
  };
}

export function parseOperatorId(operatorId?: string | null): Hcs10Operator | null {
  if (!operatorId) {
    return null;
  }
  const [inboundTopicId, accountId] = operatorId.split("@");
  if (!inboundTopicId || !accountId) {
    return null;
  }
  return { inboundTopicId, accountId };
}

function decodeHcs10Event(message: MirrorTopicMessage): InboxEvent | null {
  const parsed = decodeJson(message);
  if (!parsed || parsed.p !== "hcs-10" || typeof parsed.op !== "string") {
    return null;
  }

  const operator = parseOperatorId(parsed.operator_id as string | undefined);

  if (parsed.op === "connection_request") {
    return {
      kind: "connection-request",
      sequenceNumber: message.sequenceNumber,
      consensusTimestamp: message.consensusTimestamp,
      operator,
      memo: typeof parsed.m === "string" ? parsed.m : undefined,
      requestorOutboundTopicId:
        typeof parsed.requestor_outbound_topic_id === "string"
          ? parsed.requestor_outbound_topic_id
          : undefined,
      requestorAlias:
        typeof parsed.requestor_alias === "string" ? parsed.requestor_alias : undefined,
      requestorDisplayName:
        typeof parsed.requestor_display_name === "string"
          ? parsed.requestor_display_name
          : undefined,
      note: typeof parsed.note === "string" ? parsed.note : undefined,
      raw: parsed,
    };
  }

  if (parsed.op === "connection_created") {
    return {
      kind: "connection-created",
      sequenceNumber: message.sequenceNumber,
      consensusTimestamp: message.consensusTimestamp,
      operator,
      connectionTopicId:
        typeof parsed.connection_topic_id === "string"
          ? parsed.connection_topic_id
          : null,
      connectedAccountId:
        typeof parsed.connected_account_id === "string"
          ? parsed.connected_account_id
          : null,
      connectionId:
        typeof parsed.connection_id === "number"
          ? parsed.connection_id
          : typeof parsed.connection_request_id === "number"
            ? parsed.connection_request_id
            : null,
      outboundTopicId:
        typeof parsed.outbound_topic_id === "string"
          ? parsed.outbound_topic_id
          : undefined,
      requestorOutboundTopicId:
        typeof parsed.requestor_outbound_topic_id === "string"
          ? parsed.requestor_outbound_topic_id
          : undefined,
      confirmedRequestId:
        typeof parsed.confirmed_request_id === "number"
          ? parsed.confirmed_request_id
          : undefined,
      memo: typeof parsed.m === "string" ? parsed.m : undefined,
      raw: parsed,
    };
  }

  return null;
}

function decodeConnectionTopicMessage(message: MirrorTopicMessage): ConnectionTopicMessage | null {
  const parsed = decodeJson(message);
  if (!parsed || parsed.p !== "hcs-10" || parsed.op !== "message") {
    return null;
  }
  return {
    consensusTimestamp: message.consensusTimestamp,
    sequenceNumber: message.sequenceNumber,
    operator: parseOperatorId(parsed.operator_id as string | undefined),
    data: typeof parsed.data === "string" ? parsed.data : undefined,
    memo: typeof parsed.m === "string" ? parsed.m : undefined,
    raw: parsed,
  };
}

function decodeInboxEvent(message: MirrorTopicMessage): InboxEvent | null {
  const direct = decodeDirectMessage(message);
  if (direct) {
    return { kind: "direct-message", message: direct };
  }
  return decodeHcs10Event(message);
}

export async function fetchInboxEvents(topicId: string, limit = 50): Promise<InboxEvent[]> {
  const messages = await fetchTopicMessages(topicId, { limit, order: "desc" });
  return messages
    .map((message) => decodeInboxEvent(message))
    .filter((value): value is InboxEvent => Boolean(value))
    .sort((a, b) => {
      const aTs = a.kind === "direct-message" ? a.message.consensusTimestamp : a.consensusTimestamp;
      const bTs = b.kind === "direct-message" ? b.message.consensusTimestamp : b.consensusTimestamp;
      return aTs < bTs ? -1 : 1;
    });
}

export function subscribeInbox(topicId: string, onEvent: (event: InboxEvent) => void): () => void {
  return subscribeTopicWebsocket(topicId, (message) => {
    const event = decodeInboxEvent(message);
    if (event) {
      onEvent(event);
    }
  });
}

export async function fetchConnectionMessages(
  topicId: string,
  limit = 100,
): Promise<ConnectionTopicMessage[]> {
  const messages = await fetchTopicMessages(topicId, { limit, order: "desc" });
  return messages
    .map((message) => decodeConnectionTopicMessage(message))
    .filter((value): value is ConnectionTopicMessage => Boolean(value))
    .sort((a, b) => (a.consensusTimestamp < b.consensusTimestamp ? -1 : 1));
}

export function subscribeConnectionTopic(
  topicId: string,
  onMessage: (message: ConnectionTopicMessage) => void,
): () => void {
  return subscribeTopicWebsocket(topicId, (message) => {
    const decoded = decodeConnectionTopicMessage(message);
    if (decoded) {
      onMessage(decoded);
    }
  });
}

export type SubmittedMessageResult = {
  consensusTimestamp?: string;
  sequenceNumber?: number;
  runningHash?: string;
};

async function submitJsonMessage(
  signer: DAppSigner,
  topicId: string,
  payload: Record<string, unknown>,
  memo?: string,
  payerAccountId?: string,
): Promise<SubmittedMessageResult> {
  const transaction = buildHcs20SubmitMessageTx({
    topicId,
    payload,
    transactionMemo: memo ? memo.slice(0, 100) : undefined,
  });
  return submitMessageTransaction(signer, transaction, payerAccountId);
}

export async function sendDirectMessage(
  signer: DAppSigner,
  topicId: string,
  payload: DirectMessagePayload,
): Promise<void> {
  await submitJsonMessage(signer, topicId, payload, undefined, payload.from);
}

export type ConnectionRequestParams = {
  signer: DAppSigner;
  localAccountId: string;
  localInboundTopicId: string;
  localOutboundTopicId: string;
  remoteAccountId: string;
  remoteInboundTopicId: string;
  remoteOutboundTopicId?: string;
  memo?: string;
  requestorAlias?: string;
  requestorDisplayName?: string;
};

export type ConnectionRequestResult = {
  requestSequenceNumber?: number;
  consensusTimestamp?: string;
};

export async function sendConnectionRequest(
  params: ConnectionRequestParams,
): Promise<ConnectionRequestResult> {
  const {
    signer,
    localAccountId,
    localInboundTopicId,
    localOutboundTopicId,
    remoteAccountId,
    remoteInboundTopicId,
    remoteOutboundTopicId,
    memo,
    requestorAlias,
    requestorDisplayName,
  } = params;

  if (!localInboundTopicId || !localOutboundTopicId) {
    throw new Error("Active identity must have inbound and outbound topics to send requests");
  }

  const operatorId = `${localInboundTopicId}@${localAccountId}`;

  const normalizedNote = memo && memo.length > 0 ? memo.slice(0, 280) : undefined;
  void requestorAlias;
  void requestorDisplayName;

  const inboundTx = buildHcs10SubmitConnectionRequestTx({
    inboundTopicId: remoteInboundTopicId,
    operatorId,
    memo: normalizedNote,
  });
  const inboundResult = await submitMessageTransaction(signer, inboundTx, localAccountId);

  if (!inboundResult.sequenceNumber) {
    throw new Error("Connection request sequence number unavailable. Mirror may be lagging; retry.");
  }

  void remoteOutboundTopicId;

  const outboundTx = buildHcs10OutboundConnectionRequestRecordTx({
    outboundTopicId: localOutboundTopicId,
    operatorId: `${remoteInboundTopicId}@${remoteAccountId}`,
    connectionRequestId: inboundResult.sequenceNumber,
    memo: normalizedNote,
  });
  await submitMessageTransaction(signer, outboundTx, localAccountId);

  return {
    requestSequenceNumber: inboundResult.sequenceNumber,
    consensusTimestamp: inboundResult.consensusTimestamp,
  };
}

export async function sendConnectionCreatedNotification(
  signer: DAppSigner,
  remoteInboundTopicId: string,
  connectionTopicId: string,
  connectedAccountId: string,
  operator: Hcs10Operator | null,
  connectionId: number,
  memo?: string,
): Promise<SubmittedMessageResult> {
  if (!operator) {
    throw new Error("Cannot publish connection confirmation without an operator.");
  }

  const tx = buildHcs10ConfirmConnectionTx({
    inboundTopicId: remoteInboundTopicId,
    connectionTopicId,
    connectedAccountId,
    operatorId: `${operator.inboundTopicId}@${operator.accountId}`,
    connectionId,
    memo,
  });
  return submitMessageTransaction(signer, tx, operator.accountId);
}

export type OutboundConnectionRecordParams = {
  signer: DAppSigner;
  outboundTopicId: string;
  operator: Hcs10Operator;
  connectionTopicId: string;
  requestSequenceNumber: number;
  confirmationSequenceNumber?: number;
  requestorOutboundTopicId?: string;
  connectedAccountId: string;
  memo?: string;
};

export async function recordOutboundConnectionCreated(
  params: OutboundConnectionRecordParams,
): Promise<void> {
  const {
    signer,
    outboundTopicId,
    operator,
    connectionTopicId,
    requestSequenceNumber,
    confirmationSequenceNumber,
    requestorOutboundTopicId,
    memo,
  } = params;
  if (!confirmationSequenceNumber || !requestorOutboundTopicId) {
    return;
  }

  const tx = buildHcs10OutboundConnectionCreatedRecordTx({
    outboundTopicId,
    requestorOutboundTopicId,
    connectionTopicId,
    confirmedRequestId: confirmationSequenceNumber,
    connectionRequestId: requestSequenceNumber,
    operatorId: `${operator.inboundTopicId}@${operator.accountId}`,
    memo,
  });

  await submitMessageTransaction(signer, tx, operator.accountId);
}

export async function sendConnectionMessage(
  signer: DAppSigner,
  topicId: string,
  operator: Hcs10Operator | null,
  data: string,
  memo?: string,
): Promise<void> {
  if (!operator) {
    throw new Error("Cannot publish connection message without an operator.");
  }

  const tx = buildHcs10SendMessageTx({
    connectionTopicId: topicId,
    operatorId: `${operator.inboundTopicId}@${operator.accountId}`,
    data,
    memo,
  });
  await submitMessageTransaction(signer, tx, operator.accountId);
}

export { submitJsonMessage };
