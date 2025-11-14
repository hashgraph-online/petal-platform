"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ConnectionRequestTimelineItem,
  ConnectionRequestStatus,
  ResolvedContact,
} from "@/components/messages/Inbox";
import { ComposeForm } from "@/components/messages/ComposeForm";
import { useIdentity } from "@/providers/identity-provider";
import { useWallet } from "@/providers/wallet-provider";
import { fetchLatestProfileForAccount } from "@/lib/hedera/registry";
import { readAccountData, writeAccountData, storageNamespaces } from "@/lib/storage";
import { createConnectionTopic, type ConnectionRecord } from "@/lib/hedera/connections";
import type { ConnectionRequestEvent } from "@/lib/hedera/messaging";
import {
  fetchConnectionMessages,
  fetchInboxEvents,
  subscribeConnectionTopic,
  subscribeInbox,
  type ConnectionTopicMessage,
  type InboxEvent,
} from "@/lib/hedera/messaging";
import { useToast } from "@/providers/toast-provider";
import { topicExplorerUrl } from "@/config/topics";

function decodeMessageText(raw?: string | null): string | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const looksBase64 = /^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length % 4 === 0;
  if (!looksBase64) {
    return trimmed;
  }
  try {
    if (typeof atob === "function") {
      return atob(trimmed);
    }
  } catch {
    // fall through to Buffer decode
  }
  try {
    return Buffer.from(trimmed, "base64").toString("utf-8");
  } catch {
    return trimmed;
  }
}

function consensusTimestampToMs(value?: string | null): number | null {
  if (!value) {
    return null;
  }
  const [secondsPart, fractionalPart = "0"] = value.split(".");
  const seconds = Number(secondsPart);
  if (Number.isNaN(seconds)) {
    return null;
  }
  const fractional = Number(`0.${fractionalPart}`);
  const msFraction = Number.isNaN(fractional) ? 0 : fractional * 1000;
  return seconds * 1000 + msFraction;
}

export default function MessagesPage() {
  const { activeIdentity, petals, updatePetal } = useIdentity();
  const { signer } = useWallet();
  const { pushToast } = useToast();
  const composerRef = useRef<HTMLDivElement | null>(null);
  const [baseInboundTopicId, setBaseInboundTopicId] = useState<string | null>(null);
  const [baseOutboundTopicId, setBaseOutboundTopicId] = useState<string | null>(null);
  const [baseAlias, setBaseAlias] = useState<string | null>(null);
  const [baseDisplayName, setBaseDisplayName] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [requestStatuses, setRequestStatuses] = useState<Record<number, ConnectionRequestStatus>>({});
  const [preferredConnectionId, setPreferredConnectionId] = useState<string | null>(null);
  const [connectionQuery, setConnectionQuery] = useState("");
  const [threadMessages, setThreadMessages] = useState<ConnectionTopicMessage[]>([]);
  const [isThreadLoading, setIsThreadLoading] = useState(false);
  const [sidebarInboxEvents, setSidebarInboxEvents] = useState<InboxEvent[]>([]);
  const [isChatsOpen, setIsChatsOpen] = useState(true);
  const [isRequestsOpen, setIsRequestsOpen] = useState(true);
  const [isFeedOpen, setIsFeedOpen] = useState(true);

  const connectionsStorageAccount = activeIdentity?.accountId ?? null;

  useEffect(() => {
    if (!connectionsStorageAccount) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConnections([]);
      return;
    }
    const stored = readAccountData<ConnectionRecord[] | null>(
      storageNamespaces.connections,
      connectionsStorageAccount,
      [],
    );
    setConnections(stored ?? []);
  }, [connectionsStorageAccount]);

  const persistConnections = useCallback(
    (records: ConnectionRecord[]) => {
      if (!connectionsStorageAccount) {
        return;
      }
      writeAccountData(storageNamespaces.connections, connectionsStorageAccount, records, {
        ttlMs: 7 * 24 * 60 * 60 * 1000,
      });
    },
    [connectionsStorageAccount],
  );

  const resolvedInboundTopicId = useMemo(() => {
    if (!activeIdentity) return null;
    if (activeIdentity.type === "petal") {
      const record = petals.find((petal) => petal.accountId === activeIdentity.accountId);
      return record?.inboundTopicId ?? baseInboundTopicId;
    }
    return baseInboundTopicId;
  }, [activeIdentity, petals, baseInboundTopicId]);

  const resolvedOutboundTopicId = useMemo(() => {
    if (!activeIdentity) return null;
    if (activeIdentity.type === "petal") {
      const record = petals.find((petal) => petal.accountId === activeIdentity.accountId);
      return record?.outboundTopicId ?? null;
    }
    return baseOutboundTopicId;
  }, [activeIdentity, petals, baseOutboundTopicId]);

  const resolvedAlias = useMemo(() => {
    if (!activeIdentity) return null;
    if (activeIdentity.type === "petal") {
      const record = petals.find((petal) => petal.accountId === activeIdentity.accountId);
      return record?.alias ?? null;
    }
    return baseAlias;
  }, [activeIdentity, petals, baseAlias]);

  const resolvedDisplayName = useMemo(() => {
    if (!activeIdentity) return null;
    if (activeIdentity.type === "petal") {
      const record = petals.find((petal) => petal.accountId === activeIdentity.accountId);
      return record?.displayName ?? record?.alias ?? null;
    }
    return baseDisplayName;
  }, [activeIdentity, petals, baseDisplayName]);

  useEffect(() => {
    if (!resolvedInboundTopicId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSidebarInboxEvents([]);
      return;
    }

    let cancelled = false;

    fetchInboxEvents(resolvedInboundTopicId, 20)
      .then((events) => {
        if (!cancelled) {
          setSidebarInboxEvents(events);
        }
      })
      .catch((error) => {
        console.warn("sidebar:inbox", error);
      });

    const unsubscribe = subscribeInbox(resolvedInboundTopicId, (event) => {
      setSidebarInboxEvents((current) => {
        const next = [...current, event]
          .sort((a, b) => {
            const aTs = a.kind === "direct-message" ? a.message.consensusTimestamp : a.consensusTimestamp;
            const bTs = b.kind === "direct-message" ? b.message.consensusTimestamp : b.consensusTimestamp;
            return (consensusTimestampToMs(aTs) ?? 0) - (consensusTimestampToMs(bTs) ?? 0);
          })
          .slice(-40);
        return next;
      });
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [resolvedInboundTopicId]);

  useEffect(() => {
    if (!activeIdentity?.accountId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBaseInboundTopicId(null);
      setBaseOutboundTopicId(null);
      setBaseAlias(null);
      setBaseDisplayName(null);
      setPreferredConnectionId(null);
      return;
    }

    let cancelled = false;

    setPreferredConnectionId(null);

    fetchLatestProfileForAccount(activeIdentity.accountId)
      .then((profile) => {
        if (cancelled) return;
        setBaseInboundTopicId(profile?.inboundTopicId ?? null);
        setBaseOutboundTopicId(profile?.outboundTopicId ?? null);
        setBaseAlias(profile?.alias ?? null);
        setBaseDisplayName(profile?.displayName ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setBaseInboundTopicId(null);
          setBaseOutboundTopicId(null);
          setBaseAlias(null);
          setBaseDisplayName(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeIdentity?.accountId]);

  useEffect(() => {
    if (!activeIdentity || activeIdentity.type !== "petal") {
      return;
    }
    const petal = petals.find((item) => item.accountId === activeIdentity.accountId);
    if (!petal || petal.outboundTopicId) {
      return;
    }

    let cancelled = false;

    fetchLatestProfileForAccount(activeIdentity.accountId)
      .then((profile) => {
        if (cancelled || !profile?.outboundTopicId) {
          return;
        }
        updatePetal(activeIdentity.accountId, {
          outboundTopicId: profile.outboundTopicId,
          inboundTopicId: profile.inboundTopicId ?? petal.inboundTopicId,
          alias: petal.alias ?? profile.alias ?? undefined,
          displayName: profile.displayName ?? petal.displayName,
          profileReference: profile.profileReference ?? petal.profileReference,
          profileTopicId: profile.profileTopicId ?? petal.profileTopicId,
          hasProfile: true,
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [activeIdentity, petals, updatePetal]);


  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!preferredConnectionId) {
      setThreadMessages([]);
      setIsThreadLoading(false);
      return;
    }
    const connection = connections.find(
      (item) => item.connectionTopicId === preferredConnectionId,
    );
    if (!connection) {
      setThreadMessages([]);
      setIsThreadLoading(false);
      return;
    }

    let cancelled = false;
    setIsThreadLoading(true);

    fetchConnectionMessages(preferredConnectionId, 200)
      .then((history) => {
        if (!cancelled) {
          setThreadMessages(history);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("messages:thread-history", error);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsThreadLoading(false);
        }
      });

    const unsubscribe = subscribeConnectionTopic(preferredConnectionId, (message) => {
      setThreadMessages((current) => {
        const exists = current.some(
          (item) => item.consensusTimestamp === message.consensusTimestamp,
        );
        if (exists) {
          return current;
        }
        return [...current, message].sort(
          (a, b) =>
            (consensusTimestampToMs(a.consensusTimestamp) ?? 0) -
            (consensusTimestampToMs(b.consensusTimestamp) ?? 0),
        );
      });
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [preferredConnectionId, connections]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleConnectionCreated = useCallback(
    (record: ConnectionRecord) => {
      setConnections((current) => {
        const filtered = current.filter(
          (item) => item.connectionTopicId !== record.connectionTopicId,
        );
        const next = [record, ...filtered];
        persistConnections(next);
        return next;
      });
      setPreferredConnectionId(record.connectionTopicId);
    },
    [persistConnections],
  );

  const connectionRequests = useMemo(() => {
    const items = sidebarInboxEvents
      .filter((event): event is Extract<InboxEvent, { kind: "connection-request" }> => event.kind === "connection-request")
      .map((event) => {
        const contact: ResolvedContact = {
          accountId: event.operator?.accountId ?? event.requestorAlias ?? event.requestorDisplayName ?? "unknown",
          alias: event.requestorAlias,
          displayName: event.requestorDisplayName,
          inboundTopicId: event.operator?.inboundTopicId,
        };
        return {
          event,
          contact,
          status: requestStatuses[event.sequenceNumber]?.status ?? "idle",
          error: requestStatuses[event.sequenceNumber]?.error,
        } satisfies ConnectionRequestTimelineItem;
      });

    return items.sort(
      (a, b) =>
        (consensusTimestampToMs(a.event.consensusTimestamp) ?? 0) -
        (consensusTimestampToMs(b.event.consensusTimestamp) ?? 0),
    );
  }, [sidebarInboxEvents, requestStatuses]);

  const pendingRequests = useMemo(() =>
    connectionRequests.filter((item) => {
      const status = requestStatuses[item.event.sequenceNumber]?.status ?? "idle";
      return status !== "accepted";
    }),
  [connectionRequests, requestStatuses]);

  const filteredConnections = useMemo(() => {
    const normalized = connectionQuery.trim().toLowerCase();
    if (!normalized) {
      return connections;
    }
    return connections.filter((connection) => {
      const label =
        connection.contactDisplayName ??
        connection.contactAlias ??
        connection.contactAccountId ??
        "";
      return (
        label.toLowerCase().includes(normalized) ||
        connection.connectionTopicId.toLowerCase().includes(normalized)
      );
    });
  }, [connectionQuery, connections]);

  const activeConnection = useMemo(
    () => connections.find((item) => item.connectionTopicId === preferredConnectionId) ?? null,
    [connections, preferredConnectionId],
  );

  const handleSelectConnection = useCallback((connectionId: string) => {
    setPreferredConnectionId(connectionId);
    setTimeout(() => composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }, []);

  const handleScrollToComposer = useCallback(() => {
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleStartNewConversation = useCallback(() => {
    setPreferredConnectionId(null);
    setConnectionQuery("");
    handleScrollToComposer();
  }, [handleScrollToComposer]);

  const handleCopy = useCallback(
    async (value: string | null, label: string) => {
      if (!value) {
        pushToast({ title: `No ${label}`, description: "Publish a profile first", variant: "error" });
        return;
      }
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
        } else {
          const textarea = document.createElement("textarea");
          textarea.value = value;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.focus();
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
        }
        pushToast({ title: `${label} copied`, description: value, variant: "success" });
      } catch (error) {
        console.error("copy:error", error);
        pushToast({
          title: `Unable to copy ${label}`,
          description: error instanceof Error ? error.message : "Clipboard unavailable",
          variant: "error",
        });
      }
    },
    [pushToast],
  );

  const conversationTimeline = useMemo(() => {
    return threadMessages
      .slice()
      .map((message) => {
        const decoded = decodeMessageText(message.data ?? message.memo ?? "");
        const timestampMs = consensusTimestampToMs(message.consensusTimestamp) ?? Date.now();
        return {
          id: `${message.consensusTimestamp}:${message.sequenceNumber}`,
          text: decoded ?? message.data ?? message.memo ?? "",
          timestampMs,
          fromSelf: message.operator?.accountId === activeIdentity?.accountId,
        };
      })
      .sort((a, b) => a.timestampMs - b.timestampMs);
  }, [threadMessages, activeIdentity?.accountId]);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (threadEndRef.current) {
      threadEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [conversationTimeline.length, preferredConnectionId]);

  const sidebarDirectMessages = useMemo(() => {
    return sidebarInboxEvents
      .filter((event) => event.kind === "direct-message")
      .sort(
        (a, b) =>
          (consensusTimestampToMs(a.message.consensusTimestamp) ?? 0) -
          (consensusTimestampToMs(b.message.consensusTimestamp) ?? 0),
      )
      .slice(-6)
      .reverse()
      .map((event) => {
        const decoded = decodeMessageText(event.message.content);
        return {
          ...event,
          message: {
            ...event.message,
            content: decoded ?? event.message.content,
          },
        };
      });
  }, [sidebarInboxEvents]);

  const handleAcceptRequest = useCallback(
    async (event: ConnectionRequestEvent, contact: ResolvedContact) => {
      if (!signer || !activeIdentity?.accountId || !resolvedInboundTopicId) {
        pushToast({
          title: "Missing signer",
          description: "Reconnect your wallet or activate an identity",
          variant: "error",
        });
        return;
      }
      if (!resolvedOutboundTopicId) {
        pushToast({
          title: "Outbound topic required",
          description: "Publish a profile for this identity before accepting",
          variant: "error",
        });
        return;
      }
      if (!event.operator) {
        pushToast({
          title: "Invalid request",
          description: "Missing operator metadata from requester",
          variant: "error",
        });
        return;
      }

      setRequestStatuses((current) => ({
        ...current,
        [event.sequenceNumber]: { status: "processing" },
      }));

      try {
        const connectionTopicId = await createConnectionTopic({
          signer,
          localAccountId: activeIdentity.accountId,
          localInboundTopicId: resolvedInboundTopicId,
          localOutboundTopicId: resolvedOutboundTopicId,
          remoteAccountId: event.operator.accountId,
          remoteInboundTopicId: event.operator.inboundTopicId,
          requestSequenceNumber: event.sequenceNumber,
          requestorOutboundTopicId: event.requestorOutboundTopicId ?? undefined,
          memo: event.memo,
        });

        const record: ConnectionRecord = {
          connectionTopicId,
          contactAccountId: event.operator.accountId,
          contactAlias: contact.alias ?? event.requestorAlias,
          contactDisplayName: contact.displayName ?? event.requestorDisplayName,
          contactInboundTopicId: event.operator.inboundTopicId,
          connectionId: event.sequenceNumber,
          createdAt: new Date().toISOString(),
        };

        handleConnectionCreated(record);
        setRequestStatuses((current) => ({
          ...current,
          [event.sequenceNumber]: { status: "accepted" },
        }));
        setPreferredConnectionId(connectionTopicId);
        pushToast({
          title: "Connection ready",
          description: connectionTopicId,
          variant: "success",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create connection";
        console.error("messages:accept-request", error);
        setRequestStatuses((current) => ({
          ...current,
          [event.sequenceNumber]: { status: "error", error: message },
        }));
        pushToast({ title: "Connection failed", description: message, variant: "error" });
      }
    },
    [
      signer,
      activeIdentity,
      resolvedInboundTopicId,
      resolvedOutboundTopicId,
      pushToast,
      handleConnectionCreated,
    ],
  );

  const identityLabel = resolvedDisplayName ?? resolvedAlias ?? activeIdentity?.accountId ?? "Unknown";

  return (
    <section className="space-y-6">
      <header className="rounded-3xl border border-holNavy/20 bg-[rgba(18,24,54,0.9)] p-6 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-holBlue">Chats</p>
            <h1 className="mt-1 text-3xl font-semibold text-holNavy">Messages</h1>
            <p className="mt-2 max-w-2xl text-sm text-holNavy/70">
              Inspired by modern messengers: browse channels, catch inbound pings, and spin up new
              conversations powered by HCS-10.
            </p>
            <p className="mt-2 text-xs text-[var(--text-primary)]/70">
              HCS-10 keeps direct messages tamper-evident on Hedera and ties discovery to HCS-2/HCS-11
              aliases, so inboxes stay portable across apps.
            </p>
            <div className="mt-3 space-y-2 text-xs text-[var(--text-primary)]/75">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/60 bg-amber-900/30 px-3 py-1 font-semibold text-amber-100">
                Alpha: Messaging is experimental — expect rough edges.
              </div>
              <p className="rounded-lg border border-rose-500/50 bg-rose-900/40 px-3 py-2 text-rose-100">
                Network visibility: messages are on-chain and readable. Be cautious with links and
                unknown senders to avoid scams.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-holNavy/70">
            <span className="rounded-full bg-holBlue/10 px-3 py-1 font-semibold text-holNavy">
              {connections.length} connections
            </span>
            <span className="rounded-full bg-holBlue/10 px-3 py-1 font-semibold text-holNavy">
              {pendingRequests.length} pending
            </span>
            <button
              type="button"
              onClick={handleStartNewConversation}
              className="inline-flex items-center gap-2 rounded-full bg-holBlue px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-holPurple"
            >
              New chat
              <span aria-hidden="true">+</span>
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="flex h-[calc(100vh-220px)] min-h-[720px] flex-col overflow-hidden rounded-3xl border border-holNavy/20 bg-[rgba(18,24,54,0.9)] shadow-lg backdrop-blur">
          <div className="border-b border-holNavy/25 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-holNavy/60">Active identity</p>
            <div className="mt-2">
              <h2 className="text-xl font-semibold text-holNavy">{identityLabel}</h2>
              <p className="text-xs text-holNavy/60">{activeIdentity?.accountId ?? "Connect wallet"}</p>
            </div>
            <dl className="mt-4 grid gap-3 text-xs text-holNavy/60">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <dt className="text-holNavy/50">Inbound topic</dt>
                  <dd className="truncate font-medium text-holNavy">{resolvedInboundTopicId ?? "—"}</dd>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(resolvedInboundTopicId, "Inbound topic")}
                  className="font-semibold text-holBlue hover:text-holPurple"
                >
                  Copy
                </button>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <dt className="text-holNavy/50">Outbound topic</dt>
                  <dd className="truncate font-medium text-holNavy">{resolvedOutboundTopicId ?? "—"}</dd>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(resolvedOutboundTopicId, "Outbound topic")}
                  className="font-semibold text-holBlue hover:text-holPurple"
                >
                  Copy
                </button>
              </div>
            </dl>
          </div>

          <div className="border-b border-holNavy/25 p-4">
            <label className="text-xs font-semibold uppercase tracking-wide text-holNavy/60">Search</label>
            <input
              type="search"
              value={connectionQuery}
              onChange={(event) => setConnectionQuery(event.target.value)}
              placeholder="Search chats"
              className="mt-1 w-full rounded-2xl border border-holNavy/20 bg-[rgba(18,24,54,0.85)] px-4 py-2 text-sm text-[var(--text-primary)] focus:border-holBlue focus:outline-none focus:ring-2 focus:ring-holBlue/20"
            />
          </div>

          <div className="min-h-[120px] overflow-hidden">
            <div className="flex h-full flex-col">
              <button
                type="button"
                onClick={() => setIsChatsOpen((prev) => !prev)}
                className="flex items-center justify-between px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-holNavy/60"
              >
                <span>Chats</span>
                <span className="flex items-center gap-2">
                  <span>{filteredConnections.length}</span>
                  <span aria-hidden="true" className={`transition ${isChatsOpen ? "rotate-0" : "-rotate-90"}`}>
                    ▸
                  </span>
                </span>
              </button>
              <div
                className={`mt-2 px-2 pb-4 transition-all duration-200 ${
                  isChatsOpen ? "max-h-[120px]" : "max-h-0"
                } overflow-y-auto`}
              >
                {isChatsOpen ? (
                  filteredConnections.length === 0 ? (
                    <p className="px-2 text-sm text-holNavy/60">
                      {connections.length === 0
                        ? "No channels yet. Accept a request or start a direct message."
                        : "No chats match that filter."}
                    </p>
                  ) : (
                    filteredConnections.map((connection) => {
                      const label =
                        connection.contactDisplayName ??
                        (connection.contactAlias ? `@${connection.contactAlias}` : connection.contactAccountId);
                      const isActive = preferredConnectionId === connection.connectionTopicId;
                      return (
                        <button
                          type="button"
                          key={connection.connectionTopicId}
                          onClick={() => handleSelectConnection(connection.connectionTopicId)}
                          className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition ${
                            isActive
                              ? "bg-holBlue text-white shadow"
                              : "hover:bg-holBlue/10"
                          }`}
                        >
                          <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${
                            isActive ? "bg-white/20" : "bg-holNavy/30 text-[var(--text-primary)]"
                          }`}>
                            {label.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <p className={`text-sm font-semibold ${isActive ? "text-white" : "text-[var(--text-primary)]"}`}>
                              {label}
                            </p>
                            <p className={`text-xs ${isActive ? "text-white/80" : "text-holNavy/60"}`}>
                              Topic {connection.connectionTopicId}
                            </p>
                          </div>
                        </button>
                      );
                    })
                  )
                ) : null}
              </div>
            </div>
          </div>

          <div className="border-t border-holNavy/25 px-4 pb-4 pt-3 space-y-4 overflow-y-auto max-h-[240px]">
            <div>
              <button
                type="button"
                onClick={() => setIsRequestsOpen((prev) => !prev)}
                className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-holNavy/60"
              >
                <span>Requests</span>
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-holBlue/15 px-2 py-0.5 text-[var(--text-primary)]">
                    {pendingRequests.length}
                  </span>
                  <span aria-hidden="true" className={`transition ${isRequestsOpen ? "rotate-0" : "-rotate-90"}`}>
                    ▸
                  </span>
                </span>
              </button>
              {isRequestsOpen ? (
                !resolvedInboundTopicId ? (
                  <p className="mt-3 text-sm text-holNavy/60">
                    Publish a profile to mint inbound/outbound topics before accepting requests.
                  </p>
                ) : pendingRequests.length === 0 ? (
                  <p className="mt-3 text-sm text-holNavy/60">No pending invites right now.</p>
                ) : (
                  <div className="mt-3 max-h-[120px] space-y-2 overflow-y-auto pr-1">
                    {pendingRequests.map((item) => {
                      const status = requestStatuses[item.event.sequenceNumber] ?? { status: "idle" };
                      const label =
                        item.contact.displayName ??
                        (item.contact.alias ? `@${item.contact.alias}` : item.contact.accountId);
                      return (
                        <div
                          key={`sidebar-request-${item.event.sequenceNumber}`}
                          className="rounded-2xl border border-holNavy/20 bg-[rgba(18,24,54,0.85)] px-3 py-2 text-sm text-[var(--text-primary)] shadow-sm"
                        >
                          <p className="font-semibold">{label}</p>
                          {item.event.note ? (
                            <p className="mt-1 text-xs text-holNavy/60">“{item.event.note}”</p>
                          ) : null}
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-holNavy/60">
                          <span>{item.event.operator?.inboundTopicId ?? "—"}</span>
                          <span aria-hidden="true">•</span>
                          <time dateTime={item.event.consensusTimestamp}>
                            {(() => {
                              const tsMs = consensusTimestampToMs(item.event.consensusTimestamp);
                              return tsMs ? new Date(tsMs).toLocaleString() : "—";
                            })()}
                          </time>
                        </div>
                          <button
                            type="button"
                            onClick={() => handleAcceptRequest(item.event, item.contact)}
                            disabled={status.status === "processing" || status.status === "accepted"}
                            className={`mt-2 inline-flex w-full items-center justify-center rounded-full px-3 py-1 text-xs font-semibold transition ${
                              status.status === "processing"
                                ? "bg-holNavy/30 text-holNavy/60"
                                : "bg-holBlue text-white hover:bg-holPurple"
                            }`}
                          >
                            {status.status === "processing"
                              ? "Creating…"
                              : status.status === "accepted"
                                ? "Channel ready"
                                : "Accept"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : null}
            </div>

            <div>
              <button
                type="button"
                onClick={() => setIsFeedOpen((prev) => !prev)}
                className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-holNavy/60"
              >
                <span>Inbound feed</span>
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-holBlue/15 px-2 py-0.5 text-[var(--text-primary)]">
                    {sidebarDirectMessages.length}
                  </span>
                  <span aria-hidden="true" className={`transition ${isFeedOpen ? "rotate-0" : "-rotate-90"}`}>
                    ▸
                  </span>
                </span>
              </button>
              {isFeedOpen ? (
                !resolvedInboundTopicId ? (
                  <p className="mt-3 text-sm text-holNavy/60">Provision an inbound topic to see message previews.</p>
                ) : sidebarDirectMessages.length === 0 ? (
                  <p className="mt-3 text-sm text-holNavy/60">No inbound messages yet.</p>
                ) : (
                  <ul className="mt-3 max-h-[120px] space-y-2 overflow-y-auto pr-1 text-sm text-[var(--text-primary)]">
                    {sidebarDirectMessages.map((event, index) => (
                      <li
                        key={`${event.kind}-${index}`}
                        className="rounded-2xl border border-holNavy/20 bg-[rgba(18,24,54,0.85)] px-3 py-2 shadow-sm"
                      >
                        <div className="flex items-center justify-between text-[11px] text-holNavy/60">
                          <span className="font-semibold text-[var(--text-primary)]">
                            {event.message.from}
                          </span>
                          <time dateTime={event.message.consensusTimestamp}>
                            {(() => {
                              const tsMs = consensusTimestampToMs(event.message.consensusTimestamp);
                              return tsMs
                                ? new Date(tsMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                                : "—";
                            })()}
                          </time>
                        </div>
                        {event.kind === "direct-message" ? (
                          <p className="mt-1 text-xs text-holNavy/60 break-words">
                            {event.message.content}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-holNavy/60">{event.kind}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </div>
          </div>
        </aside>

        <div className="flex min-h-[640px] flex-col rounded-3xl border border-holNavy/20 bg-[rgba(18,24,54,0.9)] shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-holNavy/25 px-6 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-holNavy/60">
                {activeConnection ? "Channel" : "Inbox"}
              </p>
              <h2 className="text-2xl font-semibold text-holNavy">
                {activeConnection
                  ? activeConnection.contactDisplayName ??
                    activeConnection.contactAlias ??
                    activeConnection.contactAccountId
                  : identityLabel}
              </h2>
              <p className="text-xs text-holNavy/60">
                {activeConnection ? activeConnection.connectionTopicId : resolvedInboundTopicId ?? "No topic"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {activeConnection ? (
                <a
                  href={topicExplorerUrl(activeConnection.connectionTopicId)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-holNavy/10 px-3 py-1 font-semibold text-holNavy/70 hover:border-holBlue/40 hover:text-holBlue"
                >
                  View in explorer ↗
                </a>
              ) : null}
              <button
                type="button"
                onClick={handleStartNewConversation}
                className="rounded-full border border-holNavy/10 px-3 py-1 font-semibold text-holNavy/70 hover:border-holBlue/40 hover:text-holBlue"
              >
                Direct message
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden bg-[rgba(12,18,47,0.9)]">
            {activeConnection ? (
              <div className="flex h-full flex-col">
                <div className="flex-1 overflow-y-auto px-6 py-6">
                  <div className="flex min-h-full flex-col justify-end">
                    {conversationTimeline.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-holNavy/60">
                        <p className="text-lg font-semibold text-[var(--text-primary)]">No messages yet</p>
                        <p className="max-w-sm text-sm text-holNavy/60">
                          Start the conversation with{" "}
                          {activeConnection.contactDisplayName ??
                            activeConnection.contactAlias ??
                            activeConnection.contactAccountId}
                          .
                        </p>
                      </div>
                    ) : (
                      <>
                        <ul className="space-y-4">
                          {conversationTimeline.map((item) => (
                            <li key={item.id} className={`flex ${item.fromSelf ? "justify-end" : "justify-start"}`}>
                              <div
                                className={`max-w-[75%] rounded-3xl px-4 py-2 text-sm shadow-sm ${
                                  item.fromSelf
                                    ? "rounded-br-sm bg-holBlue text-white"
                                    : "rounded-bl-sm border border-holNavy/30 bg-[rgba(18,24,54,0.85)] text-[var(--text-primary)]"
                                }`}
                              >
                                <p>
                                  {item.text || (
                                    <span className="text-xs italic opacity-80">(no payload provided)</span>
                                  )}
                                </p>
                              <span
                                className={`mt-1 block text-[11px] ${
                                  item.fromSelf ? "text-white/80" : "text-holNavy/60"
                                }`}
                              >
                                {new Date(item.timestampMs).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                        <div ref={threadEndRef} />
                      </>
                    )}
                  </div>
                </div>
                {isThreadLoading ? (
                  <div className="border-t border-holNavy/25 bg-[rgba(18,24,54,0.9)] px-4 py-2 text-center text-xs text-holNavy/60">
                    Loading thread…
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-holNavy/60">
                <p className="text-lg font-semibold text-[var(--text-primary)]">Select a chat</p>
                <p className="max-w-sm text-sm text-holNavy/60">
                  Pick a connection from the sidebar or start a new direct message.
                </p>
              </div>
            )}
          </div>

          <div ref={composerRef} className="border-t border-holNavy/25 bg-[rgba(18,24,54,0.9)] px-4 py-4">
            <ComposeForm
              signer={signer}
              senderAccountId={activeIdentity?.accountId ?? null}
              inboundTopicId={resolvedInboundTopicId}
              connections={connections}
              outboundTopicId={resolvedOutboundTopicId}
              senderAlias={resolvedAlias}
              senderDisplayName={resolvedDisplayName}
              preferredConnectionId={preferredConnectionId}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
