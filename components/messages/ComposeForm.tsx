"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listRecentProfiles,
  searchProfileByAlias,
  type RegistryProfile,
} from "@/lib/hedera/registry";
import { sendConnectionRequest, sendConnectionMessage } from "@/lib/hedera/messaging";
import type { DAppSigner } from "@hashgraph/hedera-wallet-connect";
import type { ConnectionRecord } from "@/lib/hedera/connections";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/providers/toast-provider";

type ComposeFormProps = {
  signer: DAppSigner | null;
  senderAccountId: string | null;
  inboundTopicId: string | null;
  connections: ConnectionRecord[];
  outboundTopicId: string | null;
  senderAlias?: string | null;
  senderDisplayName?: string | null;
  preferredConnectionId?: string | null;
};

type ComposeState = "idle" | "resolving" | "sending";

export function ComposeForm({
  signer,
  senderAccountId,
  inboundTopicId,
  outboundTopicId,
  connections,
  senderAlias,
  senderDisplayName,
  preferredConnectionId,
}: ComposeFormProps) {
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<ComposeState>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [resolvedProfile, setResolvedProfile] = useState<RegistryProfile | null>(null);
  const [recentContacts, setRecentContacts] = useState<string[]>([]);
  const [mode, setMode] = useState<"direct" | "connection">(
    connections.length > 0 ? "connection" : "direct",
  );
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>(
    connections[0]?.connectionTopicId ?? "",
  );
  const [suggestions, setSuggestions] = useState<RegistryProfile[]>([]);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const { pushToast } = useToast();

  const selectedConnection = useMemo(
    () => connections.find((connection) => connection.connectionTopicId === selectedConnectionId) ?? null,
    [connections, selectedConnectionId],
  );

  useEffect(() => {
    if (!preferredConnectionId) {
      return;
    }
    const exists = connections.some(
      (connection) => connection.connectionTopicId === preferredConnectionId,
    );
    if (!exists) {
      return;
    }
    setMode("connection");
    setSelectedConnectionId(preferredConnectionId);
  }, [preferredConnectionId, connections]);

  const canSendDirect = Boolean(
    signer &&
      senderAccountId &&
      inboundTopicId &&
      outboundTopicId &&
      resolvedProfile?.inboundTopicId,
  );
  const canSendConnection = Boolean(
    signer && senderAccountId && inboundTopicId && selectedConnection,
  );
  const isReady = mode === "direct" ? canSendDirect : canSendConnection;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem("petal-recent-contacts");
    if (!stored) {
      return;
    }
    try {
      const parsed = JSON.parse(stored) as string[];
      setRecentContacts(parsed.slice(0, 10));
    } catch (error) {
      console.warn("Failed to parse recent contacts", error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listRecentProfiles(200)
      .then((profiles) => {
        if (!cancelled) {
          setSuggestions(profiles.filter((profile) => Boolean(profile.alias)));
        }
      })
      .catch((error) => {
        console.warn("Failed to load profile suggestions", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const suggestionLookup = useMemo(() => {
    const map = new Map<string, RegistryProfile>();
    for (const profile of suggestions) {
      if (profile.alias) {
        map.set(profile.alias.toLowerCase(), profile);
      }
    }
    return map;
  }, [suggestions]);

  useEffect(() => {
    if (mode === "connection" && connections.length === 0) {
      setMode("direct");
      return;
    }
    if (mode === "connection" && connections.length > 0 && !selectedConnection) {
      setSelectedConnectionId(connections[0]!.connectionTopicId);
    }
  }, [mode, connections, selectedConnection]);

  useEffect(() => {
    if (mode !== "direct") {
      setResolvedProfile(null);
      setStatus("idle");
      setStatusMessage(null);
      return;
    }

    const normalized = recipient.trim().toLowerCase();

    if (!normalized) {
      setResolvedProfile(null);
      setStatus("idle");
      setStatusMessage(null);
      return;
    }

    let cancelled = false;
    setStatusMessage(null);

    const cachedMatch = suggestionLookup.get(normalized);
    if (cachedMatch) {
      setResolvedProfile(cachedMatch);
      setStatus("idle");
      return () => {
        cancelled = true;
      };
    }

    if (normalized.length < 3) {
      setResolvedProfile(null);
      setStatus("idle");
      setStatusMessage("Enter at least 3 characters to search the registry");
      return () => {
        cancelled = true;
      };
    }

    setStatus("resolving");

    const timer = setTimeout(() => {
      searchProfileByAlias(normalized)
        .then((profile) => {
          if (cancelled) return;
          setResolvedProfile(profile);
          if (!profile) {
            setStatusMessage("Profile not found in recent registry snapshot");
          }
        })
        .catch((error) => {
          if (cancelled) return;
          console.error("Alias lookup failed", error);
          setStatusMessage(error instanceof Error ? error.message : "Lookup failed");
          setResolvedProfile(null);
        })
        .finally(() => {
          if (!cancelled) {
            setStatus("idle");
          }
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [recipient, suggestionLookup, mode]);

  const filteredSuggestions = useMemo(() => {
    const normalized = recipient.trim().toLowerCase();
    const recentSet = new Set<string>(recentContacts.map((item) => item.toLowerCase()));

    const baseSuggestions = suggestions.filter(
      (profile) => profile.alias && profile.inboundTopicId,
    );

    if (!normalized) {
      const recentMatches = Array.from(recentSet)
        .map((alias) => suggestionLookup.get(alias) ?? null)
        .filter((profile): profile is RegistryProfile => Boolean(profile));
      const filler = baseSuggestions.filter(
        (profile) => profile.alias && !recentSet.has(profile.alias.toLowerCase()),
      );
      return [...recentMatches, ...filler].slice(0, 8);
    }

    return baseSuggestions
      .filter((profile) => {
        const alias = profile.alias?.toLowerCase() ?? "";
        const display = profile.displayName?.toLowerCase() ?? "";
        const account = profile.accountId.toLowerCase();
        return (
          alias.includes(normalized) ||
          display.includes(normalized) ||
          account.includes(normalized)
        );
      })
      .slice(0, 8);
  }, [recipient, suggestions, suggestionLookup, recentContacts]);

  useEffect(() => {
    if (!isSuggestionsOpen || filteredSuggestions.length === 0) {
      setActiveSuggestionIndex(-1);
      return;
    }
    setActiveSuggestionIndex(0);
  }, [filteredSuggestions.length, isSuggestionsOpen]);

  useEffect(() => {
    if (mode !== "direct") {
      setIsSuggestionsOpen(false);
    }
  }, [mode]);

  useEffect(() => {
    setStatusMessage(null);
  }, [mode, selectedConnectionId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSuggestionsOpen(false);

    if (!signer || !senderAccountId) {
      setStatusMessage("Connect your wallet before sending");
      return;
    }

    const trimmedMessage = message.trim();

    if (mode === "connection" && !trimmedMessage) {
      setStatusMessage("Enter a message");
      return;
    }

    if (mode === "connection") {
      if (!selectedConnection || !inboundTopicId) {
        setStatusMessage("Select a connection channel");
        return;
      }

      setStatus("sending");
      setStatusMessage(null);

      try {
        await sendConnectionMessage(
          signer,
          selectedConnection.connectionTopicId,
          {
            inboundTopicId,
            accountId: senderAccountId,
          },
          trimmedMessage,
        );
        setMessage("");
        setStatusMessage("Message sent");
        pushToast({ title: "Message sent", variant: "success" });
      } catch (error) {
        console.error("Failed to send connection message", error);
        setStatusMessage(error instanceof Error ? error.message : "Failed to send message");
        pushToast({
          title: "Message failed",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "error",
        });
      } finally {
        setStatus("idle");
      }

      return;
    }

    if (!resolvedProfile?.inboundTopicId) {
      setStatusMessage("Resolve a contact before sending a request");
      return;
    }
    if (!inboundTopicId || !outboundTopicId) {
      setStatusMessage("Active identity is missing inbound/outbound topics");
      return;
    }

    setStatus("sending");
    setStatusMessage("Sending connection request…");

    try {
      await sendConnectionRequest({
        signer,
        localAccountId: senderAccountId,
        localInboundTopicId: inboundTopicId,
        localOutboundTopicId: outboundTopicId,
        remoteAccountId: resolvedProfile.accountId,
        remoteInboundTopicId: resolvedProfile.inboundTopicId,
        remoteOutboundTopicId: resolvedProfile.outboundTopicId,
        memo: trimmedMessage,
        requestorAlias: senderAlias ?? undefined,
        requestorDisplayName: senderDisplayName ?? undefined,
      });
      updateRecentContacts(recipient);
      setMessage("");
      setStatusMessage("Connection request sent");
      pushToast({
        title: "Request sent",
        description: "The recipient will see it in their inbox",
        variant: "success",
      });
    } catch (error) {
      console.error("Failed to send connection request", error);
      setStatusMessage(error instanceof Error ? error.message : "Failed to send request");
      pushToast({
        title: "Request failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setStatus("idle");
    }
  }

  function updateRecentContacts(alias: string) {
    if (typeof window === "undefined") {
      return;
    }
    const normalized = alias.trim().toLowerCase();
    setRecentContacts((current) => {
      const next = [normalized, ...current.filter((item) => item !== normalized)].slice(0, 10);
      window.localStorage.setItem("petal-recent-contacts", JSON.stringify(next));
      return next;
    });
  }

  function handleUseRecent(value: string) {
    setRecipient(value);
    setIsSuggestionsOpen(true);
  }

  function handleSelectProfile(profile: RegistryProfile) {
    if (!profile.alias) {
      return;
    }
    const alias = profile.alias.toLowerCase();
    setRecipient(alias);
    setResolvedProfile(profile);
    setStatusMessage(null);
    updateRecentContacts(alias);
    setIsSuggestionsOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isSuggestionsOpen || filteredSuggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestionIndex((prev) => (prev + 1) % filteredSuggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestionIndex((prev) =>
        prev <= 0 ? filteredSuggestions.length - 1 : prev - 1,
      );
    } else if (event.key === "Enter") {
      const selected = filteredSuggestions[activeSuggestionIndex];
      if (selected) {
        event.preventDefault();
        handleSelectProfile(selected);
      }
    } else if (event.key === "Escape") {
      setIsSuggestionsOpen(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="flex gap-2 text-xs font-semibold text-slate-600">
        <button
          type="button"
          onClick={() => setMode("direct")}
          className={`rounded-full px-3 py-1 transition ${
            mode === "direct"
              ? "bg-violet-600 text-white shadow"
              : "border border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-600"
          }`}
        >
          Direct alias
        </button>
        <button
          type="button"
          onClick={() => setMode("connection")}
          disabled={connections.length === 0}
          className={`rounded-full px-3 py-1 transition ${
            mode === "connection"
              ? "bg-violet-600 text-white shadow"
              : "border border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-600"
          } ${connections.length === 0 ? "cursor-not-allowed opacity-60" : ""}`}
        >
          Connection channel
        </button>
      </div>

      {mode === "direct" ? (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-700">Recipient alias</label>
          <div className="relative">
            <input
              type="text"
              value={recipient}
              onChange={(event) => {
                setRecipient(event.target.value);
                setIsSuggestionsOpen(true);
              }}
              onFocus={() => setIsSuggestionsOpen(true)}
              onBlur={() => {
                setTimeout(() => setIsSuggestionsOpen(false), 120);
              }}
              onKeyDown={handleKeyDown}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
              placeholder="alice-agent"
              autoComplete="off"
            />
            {isSuggestionsOpen && filteredSuggestions.length > 0 ? (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                <ul className="max-h-64 divide-y divide-slate-100 overflow-auto text-sm">
                  {filteredSuggestions.map((profile, index) => (
                    <li key={profile.accountId}>
                      <button
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          handleSelectProfile(profile);
                        }}
                        className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition ${
                          index === activeSuggestionIndex
                            ? "bg-violet-50"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <span className="font-medium text-slate-900">{profile.displayName ?? profile.alias}</span>
                        <span className="text-xs text-slate-500">
                          {profile.alias ? `@${profile.alias}` : profile.accountId}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {isSuggestionsOpen && filteredSuggestions.length === 0 ? (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 shadow-lg">
                {recipient.trim()
                  ? "No matching profiles in the recent registry snapshot"
                  : "No cached profiles yet. Publish profiles to populate suggestions."}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {recentContacts.map((alias) => (
              <button
                key={alias}
                type="button"
                onClick={() => handleUseRecent(alias)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:border-violet-200 hover:text-violet-600"
              >
                @{alias}
              </button>
            ))}
          </div>
          {resolvedProfile ? (
            <p className="text-xs text-slate-500">
              Resolved: {resolvedProfile.displayName ?? resolvedProfile.alias ?? resolvedProfile.accountId}
              {resolvedProfile.alias ? ` · @${resolvedProfile.alias}` : ""}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-700">Connection channel</label>
          <select
            value={selectedConnectionId}
            onChange={(event) => setSelectedConnectionId(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          >
            {connections.map((connection) => (
              <option key={connection.connectionTopicId} value={connection.connectionTopicId}>
                {connection.contactDisplayName ?? connection.contactAlias ?? connection.contactAccountId} · {connection.connectionTopicId}
              </option>
            ))}
          </select>
          {selectedConnection ? (
            <p className="text-xs text-slate-500">
              Chat with {selectedConnection.contactDisplayName ?? selectedConnection.contactAlias ?? selectedConnection.contactAccountId}
            </p>
          ) : null}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-700">
          {mode === "direct" ? "Connection note (optional)" : "Message"}
        </label>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="min-h-[120px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          placeholder={
            mode === "direct"
              ? "Share context or intent for the connection"
              : "Say hello or share coordination details"
          }
        />
      </div>
      {mode === "direct" && status === "resolving" ? (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Spinner size="sm" /> Looking up profile…
        </p>
      ) : null}
      {statusMessage ? (
        <p className="text-sm text-slate-600">{statusMessage}</p>
      ) : null}
      <button
        type="submit"
        disabled={!isReady || status !== "idle"}
        className="inline-flex items-center justify-center rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "sending" ? (
          <span className="flex items-center gap-2">
            <Spinner size="sm" /> Sending…
          </span>
        ) : mode === "direct" ? (
          "Send request"
        ) : (
          "Send message"
        )}
      </button>
      {!isReady ? (
        <p className="text-xs text-slate-500">
          {mode === "direct"
            ? "Resolve a contact and ensure your identity has published inbound & outbound topics."
            : "Select a connection channel to start chatting."}
        </p>
      ) : null}
    </form>
  );
}
