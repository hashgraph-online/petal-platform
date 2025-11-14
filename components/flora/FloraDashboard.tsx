"use client";

import { Buffer } from "buffer";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchTopicMessages,
  subscribeTopicWebsocket,
  type MirrorTopicMessage,
} from "@/lib/hedera/mirror";
import {
  sendFloraChat,
  sendFloraProposal,
  sendFloraStateUpdate,
  sendFloraVote,
  type FloraChatMessage,
  type FloraProposalMessage,
  type FloraStateMessage,
  type FloraVoteMessage,
} from "@/lib/hedera/flora";
import type { FloraRecord } from "@/providers/flora-provider";
import type { DAppSigner } from "@hashgraph/hedera-wallet-connect";
import { isDebug } from "@/config/env";
import { useDebug } from "@/providers/debug-provider";

const MAX_EVENTS = 200;

type FloraDashboardProps = {
  flora: FloraRecord | null;
  signer: DAppSigner | null;
  accountId: string | null;
  muted: boolean;
  onToggleMute: (floraId: string) => void;
};

type FloraEvent = {
  id: string;
  payload: unknown;
  timestamp: string;
};

function decodeMessage(message: MirrorTopicMessage) {
  if (!message.message) {
    return null;
  }
  try {
    const json = Buffer.from(message.message, "base64").toString("utf-8");
    return JSON.parse(json) as unknown;
  } catch (error) {
    if (isDebug) {
      console.warn("Failed to decode flora topic message", error);
    }
    return null;
  }
}

export function FloraDashboard({ flora, signer, accountId, muted, onToggleMute }: FloraDashboardProps) {
  const [commEvents, setCommEvents] = useState<FloraEvent[]>([]);
  const [txEvents, setTxEvents] = useState<FloraEvent[]>([]);
  const [stateEvents, setStateEvents] = useState<FloraEvent[]>([]);
  const [chatMessage, setChatMessage] = useState("");
  const [proposalText, setProposalText] = useState("");
  const [proposalId, setProposalId] = useState("");
  const [stateSummary, setStateSummary] = useState("");
  const [voteProposalId, setVoteProposalId] = useState("");
  const [voteChoice, setVoteChoice] = useState<"yes" | "no">("yes");

  const communicationTopic = flora?.topics.communication ?? null;
  const transactionTopic = flora?.topics.transaction ?? null;
  const stateTopic = flora?.topics.state ?? null;
  const { debugMode } = useDebug();
  const memberNames = useMemo(() => {
    if (!flora) return {} as Record<string, string>;
    return flora.members.reduce<Record<string, string>>((acc, member) => {
      acc[member.accountId] = member.alias ?? member.accountId;
      return acc;
    }, {});
  }, [flora]);

  const subscribe = useCallback(
    (topicId: string | null, setter: React.Dispatch<React.SetStateAction<FloraEvent[]>>) => {
      if (!topicId) {
        setter([]);
        return undefined;
      }

      let cancelled = false;
      fetchTopicMessages(topicId, { limit: MAX_EVENTS })
        .then((history) => {
          if (cancelled) return;
          const events = history
            .map((message) => ({
              payload: decodeMessage(message),
              timestamp: message.consensusTimestamp,
              id: `${message.consensusTimestamp}:${message.sequenceNumber}`,
            }))
            .filter((item) => item.payload !== null) as FloraEvent[];
          setter(events.reverse());
        })
        .catch((error) => console.error("Failed to fetch flora events", error));

      const unsubscribe = subscribeTopicWebsocket(topicId, (message) => {
        const payload = decodeMessage(message);
        if (!payload) {
          return;
        }
        setter((current) => {
          const exists = current.some((item) => item.id === `${message.consensusTimestamp}:${message.sequenceNumber}`);
          if (exists) {
            return current;
          }
          const next = [
            {
              id: `${message.consensusTimestamp}:${message.sequenceNumber}`,
              payload,
              timestamp: message.consensusTimestamp,
            },
            ...current,
          ];
          return next.slice(0, MAX_EVENTS);
        });
      });

      return () => {
        cancelled = true;
        unsubscribe?.();
      };
    },
    [],
  );

  useEffect(() => subscribe(communicationTopic, setCommEvents), [communicationTopic, subscribe]);
  useEffect(() => subscribe(transactionTopic, setTxEvents), [transactionTopic, subscribe]);
  useEffect(() => subscribe(stateTopic, setStateEvents), [stateTopic, subscribe]);

  if (!flora) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
        Select a flora to inspect its communication topics.
      </div>
    );
  }

  const canInteract = Boolean(signer && accountId);

  async function handleSendChat(event: React.FormEvent) {
    event.preventDefault();
    if (!canInteract || !communicationTopic || !chatMessage.trim() || !accountId || !signer) {
      return;
    }
    const payload: FloraChatMessage = {
      type: "flora_chat",
      from: accountId,
      content: chatMessage.trim(),
      sentAt: new Date().toISOString(),
    };
    await sendFloraChat(signer, communicationTopic, payload);
    setChatMessage("");
  }

  async function handleSendProposal(event: React.FormEvent) {
    event.preventDefault();
    if (!canInteract || !transactionTopic || !proposalText.trim() || !proposalId.trim() || !accountId || !signer) {
      return;
    }
    const payload: FloraProposalMessage = {
      type: "flora_proposal",
      proposalId: proposalId.trim(),
      from: accountId,
      text: proposalText.trim(),
      sentAt: new Date().toISOString(),
    };
    await sendFloraProposal(signer, transactionTopic, payload);
    setProposalId("");
    setProposalText("");
  }

  async function handleSendVote(event: React.FormEvent) {
    event.preventDefault();
    if (!canInteract || !transactionTopic || !voteProposalId.trim() || !accountId || !signer) {
      return;
    }
    const payload: FloraVoteMessage = {
      type: "flora_vote",
      proposalId: voteProposalId.trim(),
      from: accountId,
      vote: voteChoice,
      sentAt: new Date().toISOString(),
    };
    await sendFloraVote(signer, transactionTopic, payload);
    setVoteProposalId("");
  }

  async function handleStateUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (!canInteract || !stateTopic || !stateSummary.trim() || !accountId || !signer) {
      return;
    }
    const payload: FloraStateMessage = {
      type: "flora_state",
      from: accountId,
      summary: stateSummary.trim(),
      sentAt: new Date().toISOString(),
      stateHash: null, // TODO: compute HCS-17 state hash when state tracking is implemented.
    };
    await sendFloraStateUpdate(signer, stateTopic, payload);
    setStateSummary("");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">{flora.name}</h2>
          <p className="text-xs text-slate-500">
            {flora.status === "pending" ? "Awaiting confirmations" : "Active"} · Topics: Comm {communicationTopic}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onToggleMute(flora.id)}
          className={`rounded-full px-4 py-1 text-xs font-semibold shadow-sm transition ${
            muted
              ? "bg-slate-200 text-slate-600 hover:bg-slate-300"
              : "bg-violet-600 text-white hover:bg-violet-500"
          }`}
        >
          {muted ? "Muted" : "Mute"}
        </button>
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-slate-700">Communication</h3>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <ul className="space-y-2 text-sm text-slate-700 max-h-72 overflow-y-auto">
              {commEvents.map((event) => (
                <li key={event.id} className="rounded border border-slate-100 p-2">
                  <p
                    className="font-medium text-slate-900"
                    title={(event.payload as FloraChatMessage)?.from}
                  >
                    {memberNames[(event.payload as FloraChatMessage)?.from ?? ""] ?? (event.payload as FloraChatMessage)?.from ?? "Unknown"}
                  </p>
                  <p>{(event.payload as FloraChatMessage)?.content ?? ""}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(Number(event.timestamp) * 1000).toLocaleString()}
                  </p>
                  {debugMode ? (
                    <pre className="mt-1 overflow-x-auto rounded bg-slate-100 p-2 text-[11px] text-slate-600">
                      {JSON.stringify(event.payload, null, 2)}
                    </pre>
                  ) : null}
                </li>
              ))}
            </ul>
            <form className="mt-3 space-y-2" onSubmit={handleSendChat}>
              <textarea
                value={chatMessage}
                onChange={(event) => setChatMessage(event.target.value)}
                disabled={!canInteract}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                placeholder="Share an update with the flora"
              />
              <button
                type="submit"
                disabled={!canInteract || muted}
                className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Send message
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-slate-700">Proposals & Votes</h3>
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <div>
              <h4 className="text-xs font-semibold uppercase text-slate-500">Proposals</h4>
              <ul className="mt-2 space-y-2 text-sm text-slate-700 max-h-60 overflow-y-auto">
                {txEvents
                  .filter((event) => (event.payload as { type?: string })?.type === "flora_proposal")
                  .map((event) => {
                    const payload = event.payload as FloraProposalMessage;
                    return (
                      <li key={event.id} className="rounded border border-slate-100 p-2">
                        <p className="font-semibold text-slate-900">Proposal {payload.proposalId}</p>
                        <p>{payload.text}</p>
                        <p className="text-xs text-slate-500" title={payload.from}>
                          By {memberNames[payload.from] ?? payload.from}
                        </p>
                        {debugMode ? (
                          <pre className="mt-1 overflow-x-auto rounded bg-slate-100 p-2 text-[11px] text-slate-600">
                            {JSON.stringify(payload, null, 2)}
                          </pre>
                        ) : null}
                      </li>
                    );
                  })}
              </ul>
            </div>
            <form className="space-y-2" onSubmit={handleSendProposal}>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={proposalId}
                  onChange={(event) => setProposalId(event.target.value)}
                  disabled={!canInteract}
                  className="w-40 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  placeholder="proposal-id"
                />
                <input
                  type="text"
                  value={proposalText}
                  onChange={(event) => setProposalText(event.target.value)}
                  disabled={!canInteract}
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  placeholder="Describe the proposal"
                />
              </div>
              <button
                type="submit"
                disabled={!canInteract || muted}
                className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Publish proposal
              </button>
            </form>
            <form className="space-y-2" onSubmit={handleSendVote}>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={voteProposalId}
                  onChange={(event) => setVoteProposalId(event.target.value)}
                  disabled={!canInteract}
                  className="w-40 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                  placeholder="proposal-id"
                />
                <select
                  value={voteChoice}
                  onChange={(event) => setVoteChoice(event.target.value as "yes" | "no")}
                  disabled={!canInteract}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={!canInteract || muted}
                className="rounded-full bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Submit vote
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium text-slate-700">State Updates</h3>
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <ul className="space-y-2 text-sm text-slate-700 max-h-60 overflow-y-auto">
            {stateEvents.map((event) => {
              const payload = event.payload as FloraStateMessage;
              return (
                <li key={event.id} className="rounded border border-slate-100 p-2">
                  <p className="font-semibold text-slate-900" title={payload.from}>
                    {memberNames[payload.from] ?? payload.from}
                  </p>
                  <p>{payload.summary}</p>
                  {payload.stateHash ? (
                    <p className="text-xs text-slate-500">State hash: {payload.stateHash}</p>
                  ) : null}
                  <p className="text-xs text-slate-500">
                    {new Date(Number(event.timestamp) * 1000).toLocaleString()}
                  </p>
                  {debugMode ? (
                    <pre className="mt-1 overflow-x-auto rounded bg-slate-100 p-2 text-[11px] text-slate-600">
                      {JSON.stringify(payload, null, 2)}
                    </pre>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <form className="space-y-2" onSubmit={handleStateUpdate}>
            <textarea
              value={stateSummary}
              onChange={(event) => setStateSummary(event.target.value)}
              disabled={!canInteract}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
              placeholder="Summarize the latest flora state. Include hashes when available."
            />
            <button
              type="submit"
              disabled={!canInteract || muted}
              className="rounded-full bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Publish state update
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
