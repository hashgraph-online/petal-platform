"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchInboxEvents,
  subscribeInbox,
  type DirectMessage,
  type DirectMessagePayload,
  type InboxEvent,
  type ConnectionRequestEvent,
  type ConnectionCreatedEvent,
} from "@/lib/hedera/messaging";
import type { FloraCreateRequestPayload } from "@/lib/hedera/flora";
import { readAccountData, writeAccountData, storageNamespaces } from "@/lib/storage";
import { useDebug } from "@/providers/debug-provider";
import { fetchLatestProfileForAccount } from "@/lib/hedera/registry";
import { topicExplorerUrl } from "@/config/topics";
import { isDebug } from "@/config/env";
import type { ConnectionRecord } from "@/lib/hedera/connections";

export type OptimisticMessage = {
  tempId: string;
  payload: DirectMessagePayload;
};

export type InboxProps = {
  topicId: string | null;
  accountId: string | null;
  optimistic?: OptimisticMessage[];
  onFloraInvite?: (payload: FloraCreateRequestPayload) => void;
  onConnectionCreated?: (record: ConnectionRecord) => void;
  onAcceptRequest?: (event: ConnectionRequestEvent, contact: ResolvedContact) => Promise<void>;
  requestStatuses?: Record<number, ConnectionRequestStatus>;
  onConnectionRequestsChange?: (requests: ConnectionRequestTimelineItem[]) => void;
};

export type ResolvedContact = {
  accountId: string;
  alias?: string;
  displayName?: string;
  inboundTopicId?: string;
};

type ContactCandidate = {
  accountId: string;
  inboundTopicId?: string;
};

export type RequestStatus = "idle" | "processing" | "accepted" | "error";
export type ConnectionRequestStatus = { status: RequestStatus; error?: string };

export type ConnectionRequestTimelineItem = {
  event: ConnectionRequestEvent;
  contact: ResolvedContact;
  status: RequestStatus;
  error?: string;
};

type TimelineItem =
  | {
      type: "direct";
      id: string;
      message: DirectMessage;
      contact: ResolvedContact;
      optimistic?: boolean;
    }
  | {
      type: "connection-request";
      id: string;
      event: ConnectionRequestEvent;
      contact: ResolvedContact;
      status: RequestStatus;
      error?: string;
    }
  | {
      type: "connection-created";
      id: string;
      event: ConnectionCreatedEvent;
      contact: ResolvedContact;
    };

const MAX_MESSAGES = 200;

export function Inbox({
  topicId,
  accountId,
  optimistic = [],
  onFloraInvite,
  onConnectionCreated,
  onAcceptRequest,
  requestStatuses = {},
  onConnectionRequestsChange,
}: InboxProps) {
  const [events, setEvents] = useState<InboxEvent[]>([]);
  const [contacts, setContacts] = useState<Record<string, ResolvedContact>>({});
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined);
  const emittedConnectionsRef = useRef<Set<string>>(new Set());
  const { debugMode } = useDebug();

  const mapContact = useCallback(
    (account: string): ResolvedContact =>
      contacts[account] ?? {
        accountId: account,
      },
    [contacts],
  );

  const gatherContactsFromEvents = useCallback(
    (items: InboxEvent[]): ContactCandidate[] => {
      const results: ContactCandidate[] = [];
      items.forEach((item) => {
        if (item.kind === "direct-message") {
          results.push({ accountId: item.message.from });
          return;
        }
        if (item.kind === "connection-request") {
          if (item.operator) {
            results.push({
              accountId: item.operator.accountId,
              inboundTopicId: item.operator.inboundTopicId,
            });
          }
          return;
        }
        if (item.kind === "connection-created") {
          if (item.connectedAccountId) {
            results.push({ accountId: item.connectedAccountId });
          }
          if (item.operator) {
            results.push({
              accountId: item.operator.accountId,
              inboundTopicId: item.operator.inboundTopicId,
            });
          }
        }
      });
      return results;
    },
    [],
  );

  const resolveContacts = useCallback(
    async (candidates: ContactCandidate[]) => {
      const unique = new Map<string, ContactCandidate>();
      candidates.forEach((candidate) => {
        if (!candidate.accountId) {
          return;
        }
        if (!unique.has(candidate.accountId)) {
          unique.set(candidate.accountId, candidate);
        } else if (candidate.inboundTopicId && !unique.get(candidate.accountId)?.inboundTopicId) {
          unique.set(candidate.accountId, candidate);
        }
      });

      const unresolved = Array.from(unique.keys()).filter((account) => !contacts[account]);
      if (unresolved.length === 0) {
        const updates: Record<string, ResolvedContact> = {};
        unique.forEach((candidate) => {
          if (candidate.inboundTopicId && contacts[candidate.accountId]?.inboundTopicId !== candidate.inboundTopicId) {
            updates[candidate.accountId] = {
              ...(contacts[candidate.accountId] ?? { accountId: candidate.accountId }),
              inboundTopicId: candidate.inboundTopicId,
            };
          }
        });
        if (Object.keys(updates).length > 0) {
          setContacts((current) => ({ ...current, ...updates }));
        }
        return;
      }

      const lookups = await Promise.all(
        unresolved.map((account) => fetchLatestProfileForAccount(account).catch(() => null)),
      );

      const updates: Record<string, ResolvedContact> = {};
      lookups.forEach((profile, index) => {
        const account = unresolved[index];
        if (!profile) {
          const inboundTopicId = unique.get(account)?.inboundTopicId;
          updates[account] = inboundTopicId
            ? { accountId: account, inboundTopicId }
            : { accountId: account };
          return;
        }
        updates[account] = {
          accountId: account,
          alias: profile.alias,
          displayName: profile.displayName,
          inboundTopicId: profile.inboundTopicId ?? unique.get(account)?.inboundTopicId,
        };
      });

      if (Object.keys(updates).length > 0) {
        setContacts((current) => ({ ...current, ...updates }));
      }

      if (isDebug && Object.keys(updates).length > 0) {
        console.debug("inbox:resolvedContacts", updates);
      }
    },
    [contacts],
  );

  const storageNamespace = useMemo(() => {
    if (!topicId) {
      return null;
    }
    return `${storageNamespaces.inbox}-${topicId}`;
  }, [topicId]);

  useEffect(() => {
    if (!storageNamespace || !accountId) {
      return;
    }
    let cancelled = false;

    (async () => {
      const cachedRaw = readAccountData<unknown[]>(storageNamespace, accountId, []);
      if (!Array.isArray(cachedRaw) || cachedRaw.length === 0) {
        return;
      }

      const normalized: InboxEvent[] = cachedRaw
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }
          if ("kind" in entry) {
            return entry as InboxEvent;
          }
          const maybeDirect = entry as Partial<DirectMessage>;
          if (typeof maybeDirect.from === "string" && typeof maybeDirect.sentAt === "string") {
            return {
              kind: "direct-message" as const,
              message: maybeDirect as DirectMessage,
            };
          }
          return null;
        })
        .filter((value): value is InboxEvent => Boolean(value));

      if (normalized.length === 0) {
        return;
      }

      await resolveContacts(gatherContactsFromEvents(normalized));
      if (cancelled) {
        return;
      }
      setEvents(normalized);
    })();

    return () => {
      cancelled = true;
    };
  }, [storageNamespace, accountId, resolveContacts, gatherContactsFromEvents]);

  useEffect(() => {
    if (!topicId || !accountId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEvents([]);
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = undefined;
      }
      return;
    }

    let cancelled = false;

    fetchInboxEvents(topicId, MAX_MESSAGES)
      .then((history) => {
        if (cancelled) return;
        resolveContacts(gatherContactsFromEvents(history));
        history.forEach((event) => {
          if (event.kind === "direct-message" && event.message.type === "flora_create_request" && onFloraInvite) {
            onFloraInvite(event.message as unknown as FloraCreateRequestPayload);
          }
        });
        if (debugMode && isDebug) {
          console.debug("inbox:history", history);
        }
        setEvents(history);
      })
      .catch((error) => {
        console.error("Failed to fetch inbox messages", error);
      });

    unsubscribeRef.current = subscribeInbox(topicId, (event) => {
      resolveContacts(gatherContactsFromEvents([event]));
      if (
        event.kind === "direct-message" &&
        event.message.type === "flora_create_request" &&
        onFloraInvite
      ) {
        onFloraInvite(event.message as unknown as FloraCreateRequestPayload);
      }
      setEvents((current) => {
        if (event.kind === "direct-message") {
          const exists = current.some(
            (item) =>
              item.kind === "direct-message" &&
              item.message.consensusTimestamp === event.message.consensusTimestamp,
          );
          if (exists) {
            return current;
          }
        } else if (event.kind === "connection-request") {
          const exists = current.some(
            (item) =>
              item.kind === "connection-request" &&
              item.sequenceNumber === event.sequenceNumber,
          );
          if (exists) {
            return current;
          }
        }

        const next = [...current, event];
        if (debugMode && isDebug) {
          console.debug("inbox:event", event);
        }
        if (event.kind === "direct-message") {
          return next
            .slice(-MAX_MESSAGES)
            .sort((a, b) => {
              const aTs = a.kind === "direct-message" ? a.message.consensusTimestamp : a.consensusTimestamp;
              const bTs = b.kind === "direct-message" ? b.message.consensusTimestamp : b.consensusTimestamp;
              return aTs < bTs ? -1 : 1;
            });
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = undefined;
      }
    };
  }, [topicId, accountId, resolveContacts, gatherContactsFromEvents, onFloraInvite, debugMode]);

  useEffect(() => {
    if (!storageNamespace || !accountId) {
      return;
    }
    writeAccountData(storageNamespace, accountId, events, {
      ttlMs: 10 * 60 * 1000,
    });
  }, [events, storageNamespace, accountId]);

  const timelineItems = useMemo(() => {
    const baseItems: TimelineItem[] = events.map((event) => {
      if (event.kind === "direct-message") {
        return {
          type: "direct" as const,
          id: event.message.consensusTimestamp,
          message: event.message,
          contact: mapContact(event.message.from),
        };
      }

      if (event.kind === "connection-request") {
        const accountId = event.operator?.accountId ?? "";
        return {
          type: "connection-request" as const,
          id: `connection-request-${event.sequenceNumber}`,
          event,
          contact: accountId ? mapContact(accountId) : { accountId },
          status: requestStatuses[event.sequenceNumber]?.status ?? "idle",
          error: requestStatuses[event.sequenceNumber]?.error,
        };
      }

      if (event.kind === "connection-created") {
        const accountId = event.connectedAccountId ?? event.operator?.accountId ?? "";
        return {
          type: "connection-created" as const,
          id: `connection-created-${event.sequenceNumber}`,
          event,
          contact: accountId ? mapContact(accountId) : { accountId },
        };
      }

      return null as never;
    }).filter((value): value is TimelineItem => Boolean(value));

    const optimisticItems: TimelineItem[] = optimistic
      .filter((item) => item.payload.to && item.payload.sentAt)
      .map((item) => ({
        type: "direct" as const,
        id: `optimistic-${item.tempId}`,
        message: {
          ...item.payload,
          consensusTimestamp: item.tempId,
          sequenceNumber: Number.MAX_SAFE_INTEGER,
        } as DirectMessage,
        contact: mapContact(item.payload.to),
        optimistic: true,
      }));

    const combined = [...baseItems, ...optimisticItems];
    return combined.sort((a, b) => {
      const aTs =
        a.type === "direct"
          ? a.message.consensusTimestamp
          : a.event.consensusTimestamp;
      const bTs =
        b.type === "direct"
          ? b.message.consensusTimestamp
          : b.event.consensusTimestamp;
      return aTs < bTs ? -1 : 1;
    });
  }, [events, optimistic, mapContact, requestStatuses]);

  useEffect(() => {
    if (!onConnectionRequestsChange) {
      return;
    }
    const requests = timelineItems
      .filter(
        (item): item is Extract<TimelineItem, { type: "connection-request" }> =>
          item.type === "connection-request",
      )
      .map((item) => ({
        event: item.event,
        contact: item.contact,
        status: item.status,
        error: item.error,
      }));
    onConnectionRequestsChange(requests);
  }, [timelineItems, onConnectionRequestsChange]);

  useEffect(() => {
    if (!onConnectionCreated) {
      return;
    }
    const emitted = emittedConnectionsRef.current;
    events.forEach((event) => {
      if (event.kind !== "connection-created") {
        return;
      }
      const topicId = event.connectionTopicId;
      const accountId = event.connectedAccountId ?? event.operator?.accountId;
      const inbound = event.operator?.inboundTopicId;
      if (!topicId || !accountId || !inbound || emitted.has(topicId)) {
        return;
      }
      emitted.add(topicId);
      const contact = mapContact(accountId);
      const rawConnectionId = (event.raw.connection_id ?? event.raw.connectionId) as unknown;
      const connectionId =
        typeof event.connectionId === "number"
          ? event.connectionId
          : typeof rawConnectionId === "number"
            ? rawConnectionId
            : 0;
      const record: ConnectionRecord = {
        connectionTopicId: topicId,
        contactAccountId: accountId,
        contactAlias: contact.alias,
        contactDisplayName: contact.displayName,
        contactInboundTopicId: contact.inboundTopicId ?? inbound,
        connectionId,
        createdAt: new Date().toISOString(),
      };
      onConnectionCreated(record);
    });
  }, [events, mapContact, onConnectionCreated]);

  if (!topicId || !accountId) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/50 text-sm text-slate-500">
        Connect a profile with an inbound topic to view messages.
      </div>
    );
  }

  if (timelineItems.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/50 text-sm text-slate-500">
        No messages yet. Share your profile so others can reach you.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{timelineItems.length} messages</span>
        <a
          href={topicExplorerUrl(topicId)}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-violet-600 hover:text-violet-500"
        >
          View topic ↗
        </a>
      </div>
      <ul className="space-y-3">
        {timelineItems.map((item) => {
          if (item.type === "direct") {
            return (
              <li key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-slate-700" title={item.contact.accountId}>
                    {item.contact.displayName || item.contact.alias || item.contact.accountId}
                  </span>
                  <time dateTime={item.message.consensusTimestamp}>
                    {new Date(Number(item.message.consensusTimestamp) * 1000).toLocaleString()}
                  </time>
                </div>
                <div className="mt-2 text-sm text-slate-700">{item.message.content}</div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    From {item.contact.alias ? `@${item.contact.alias}` : item.contact.accountId}
                  </span>
                  {item.optimistic ? (
                    <span className="text-amber-500">Awaiting consensus…</span>
                  ) : (
                    <span className="text-slate-400">Seq #{item.message.sequenceNumber}</span>
                  )}
                </div>
              </li>
            );
          }

          if (item.type === "connection-request") {
            return (
              <li key={item.id} className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold text-slate-700">
                    {(() => {
                      const alias = item.contact.alias ?? item.event.requestorAlias;
                      return alias
                        ? `Connection request from @${alias}`
                        : `Connection request from ${item.contact.accountId}`;
                    })()}
                  </span>
                  <time dateTime={item.event.consensusTimestamp}>
                    {new Date(Number(item.event.consensusTimestamp) * 1000).toLocaleString()}
                  </time>
                </div>
                {item.event.requestorDisplayName ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {item.event.requestorDisplayName}
                  </p>
                ) : null}
                {item.event.memo ? (
                  <p className="mt-2 text-sm text-slate-700">{item.event.memo}</p>
                ) : null}
                {item.event.note ? (
                  <p className="mt-2 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-700">
                    “{item.event.note}”
                  </p>
                ) : null}
                {item.event.requestorOutboundTopicId ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Requestor outbound topic: {item.event.requestorOutboundTopicId}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-slate-500">
                  Inbound topic: {item.event.operator?.inboundTopicId ?? "unknown"}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={
                      !onAcceptRequest || item.status === "processing" || item.status === "accepted"
                    }
                    onClick={() => onAcceptRequest?.(item.event, item.contact)}
                  >
                    {item.status === "processing"
                      ? "Creating…"
                      : item.status === "accepted"
                        ? "Channel ready"
                        : "Create channel"}
                  </button>
                  <a
                    href={topicExplorerUrl(topicId)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-violet-600 hover:text-violet-500"
                  >
                    View request ↗
                  </a>
                </div>
                {item.error ? (
                  <p className="mt-2 text-xs text-rose-600">{item.error}</p>
                ) : null}
              </li>
            );
          }

          return (
            <li key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
              <div className="flex items-center justify-between">
                <span>Connection established</span>
                <time dateTime={item.event.consensusTimestamp}>
                  {new Date(Number(item.event.consensusTimestamp) * 1000).toLocaleString()}
                </time>
              </div>
              {item.event.connectionTopicId ? (
                <p className="mt-1">Topic {item.event.connectionTopicId}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
