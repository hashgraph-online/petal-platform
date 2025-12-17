"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import {
  listRecentProfiles,
  type RegistryProfile,
} from "@/lib/hedera/registry";
import { resolveProfileByIdentifier, searchRegistryProfiles } from "@/lib/hedera/profile-lookup";
import { sendConnectionRequest, sendConnectionMessage } from "@/lib/hedera/messaging";
import type { ConnectionRecord } from "@/lib/hedera/connections";
import type { DAppSigner } from "@/lib/hedera/wallet-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/providers/toast-provider";
import { getLogger } from "@/lib/logger";
import { AuthRequired } from "@/components/auth/auth-required";
import { useWallet } from "@/providers/wallet-provider";

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
  const logger = getLogger("compose-form");
  const { network } = useWallet();
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
  const [cachedProfiles, setCachedProfiles] = useState<RegistryProfile[]>([]);
  const [searchResults, setSearchResults] = useState<RegistryProfile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
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
  const walletDisabled = !signer;

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
      logger.warn("Failed to parse recent contacts", error);
    }
  }, [logger]);

  useEffect(() => {
    let cancelled = false;
    listRecentProfiles(200)
      .then((profiles) => {
        if (!cancelled) {
          setCachedProfiles(profiles.filter((profile) => Boolean(profile.alias)));
        }
      })
      .catch((error) => {
        logger.warn("Failed to load profile suggestions", error);
      });

    return () => {
      cancelled = true;
    };
  }, [logger]);

  const suggestionLookup = useMemo(() => {
    const map = new Map<string, RegistryProfile>();
    for (const profile of cachedProfiles) {
      if (profile.alias) {
        map.set(profile.alias.toLowerCase(), profile);
      }
    }
    return map;
  }, [cachedProfiles]);

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
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const normalized = recipient.trim().toLowerCase();

    if (!normalized) {
      setResolvedProfile(null);
      setStatus("idle");
      setStatusMessage(null);
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setStatusMessage(null);

    const cachedMatch = suggestionLookup.get(normalized);
    if (cachedMatch) {
      setResolvedProfile(cachedMatch);
      if (!cachedMatch.inboundTopicId) {
        setStatusMessage("Profile found, but no inbound topic is published yet.");
      }
      setStatus("idle");
      return () => {
        cancelled = true;
      };
    }

    if (normalized.length < 2) {
      setResolvedProfile(null);
      setStatus("idle");
      setStatusMessage("Enter at least 2 characters to search the registry");
      return () => {
        cancelled = true;
      };
    }

    setStatus("resolving");

    const timer = setTimeout(() => {
      resolveProfileByIdentifier(normalized, { network })
        .then((profile) => {
          if (cancelled) return;
          setResolvedProfile(profile);
          if (!profile) {
            setStatusMessage("Profile not found. Ask them to publish their HCS-11 profile.");
          } else if (!profile.inboundTopicId) {
            setStatusMessage("Profile found, but no inbound topic is published yet.");
          }
        })
        .catch((error) => {
          if (cancelled) return;
          logger.error("Alias lookup failed", error);
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
  }, [recipient, suggestionLookup, mode, logger, network]);

  useEffect(() => {
    if (mode !== "direct" || !isSuggestionsOpen) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const normalized = recipient.trim().toLowerCase();
    if (!normalized || normalized.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);

    const timer = window.setTimeout(() => {
      searchRegistryProfiles(normalized, { network, limit: 8 })
        .then((results) => {
          if (!cancelled) {
            setSearchResults(results);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            logger.warn("Profile search failed", error);
            setSearchResults([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSearchLoading(false);
          }
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isSuggestionsOpen, mode, network, recipient, logger]);

  const filteredSuggestions = useMemo(() => {
    const normalized = recipient.trim().toLowerCase();
    const recentSet = new Set<string>(recentContacts.map((item) => item.toLowerCase()));

    if (!normalized) {
      const recentMatches = Array.from(recentSet)
        .map((alias) => suggestionLookup.get(alias) ?? null)
        .filter((profile): profile is RegistryProfile => Boolean(profile));
      const filler = cachedProfiles.filter(
        (profile) => profile.alias && !recentSet.has(profile.alias.toLowerCase()),
      );
      return [...recentMatches, ...filler].slice(0, 8);
    }

    return searchResults;
  }, [cachedProfiles, recentContacts, recipient, searchResults, suggestionLookup]);

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
        logger.error("Failed to send connection message", error);
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
      logger.error("Failed to send connection request", error);
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
    if (!profile.inboundTopicId) {
      setStatusMessage("Profile selected, but no inbound topic is published yet.");
    } else {
      setStatusMessage(null);
    }
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
        if (selected.inboundTopicId) {
          handleSelectProfile(selected);
        } else {
          setStatusMessage("That profile is missing an inbound topic.");
        }
      }
    } else if (event.key === "Escape") {
      setIsSuggestionsOpen(false);
    }
  }

  const handleDirectMode = useCallback(() => {
    setMode("direct");
  }, []);

  const handleConnectionMode = useCallback(() => {
    setMode("connection");
  }, []);

  const handleRecipientChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setRecipient(event.target.value);
      setIsSuggestionsOpen(true);
    },
    [],
  );

  const handleRecipientFocus = useCallback(() => {
    setIsSuggestionsOpen(true);
  }, []);

  const handleRecipientBlur = useCallback(() => {
    window.setTimeout(() => setIsSuggestionsOpen(false), 120);
  }, []);

  const handleConnectionChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      setSelectedConnectionId(event.target.value);
    },
    [],
  );

  const handleMessageChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setMessage(event.target.value);
    },
    [],
  );

  return (
    <AuthRequired
      enabled={!walletDisabled}
      title="Wallet required"
      description="Connect your wallet to send messages."
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="flex gap-2 text-xs font-semibold text-muted-foreground">
          <Button
            type="button"
            onClick={handleDirectMode}
            variant={mode === "direct" ? "default" : "outline"}
            size="sm"
            className="rounded-full px-3 py-1 text-xs"
            disabled={walletDisabled}
          >
            Direct alias
          </Button>
          <Button
            type="button"
            onClick={handleConnectionMode}
            disabled={walletDisabled || connections.length === 0}
            variant={mode === "connection" ? "default" : "outline"}
            size="sm"
            className="rounded-full px-3 py-1 text-xs"
          >
            Connection channel
          </Button>
        </div>

        {mode === "direct" ? (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Recipient alias</label>
            <div className="relative">
              <Input
                type="text"
                value={recipient}
                onChange={handleRecipientChange}
                onFocus={handleRecipientFocus}
                onBlur={handleRecipientBlur}
                onKeyDown={handleKeyDown}
                placeholder="alice-agent"
                autoComplete="off"
                disabled={walletDisabled}
              />
              {isSuggestionsOpen && (searchLoading || filteredSuggestions.length > 0) ? (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg backdrop-blur">
                  <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
                    <span>{searchLoading ? "Searching registry…" : "Suggestions"}</span>
                    <span className="font-mono">{network}</span>
                  </div>
                  <ul className="max-h-64 divide-y divide-border overflow-auto text-sm">
                    {filteredSuggestions.map((profile, index) => (
                      <li key={profile.accountId}>
                        <button
                          type="button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            handleSelectProfile(profile);
                          }}
                          disabled={!profile.inboundTopicId}
                          className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            index === activeSuggestionIndex ? "bg-muted" : "hover:bg-muted"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-foreground">
                              {profile.displayName ?? profile.alias ?? profile.accountId}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {profile.alias ? `@${profile.alias}` : profile.accountId}
                            </span>
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              profile.inboundTopicId
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-100"
                                : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-100"
                            }`}
                          >
                            {profile.inboundTopicId ? "Ready" : "No inbox"}
                          </span>
                        </button>
                      </li>
                    ))}
                    {!searchLoading && filteredSuggestions.length === 0 ? (
                      <li className="px-3 py-3 text-xs text-muted-foreground">
                        No matches yet. Try typing a longer alias.
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
              {isSuggestionsOpen && !searchLoading && filteredSuggestions.length === 0 ? (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-dashed border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-lg backdrop-blur">
                  {recipient.trim()
                    ? "No matching profiles found."
                    : "No cached profiles yet. Publish profiles to populate suggestions."}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              {recentContacts.map((alias) => (
                <Button
                  key={alias}
                  type="button"
                  onClick={() => handleUseRecent(alias)}
                  variant="outline"
                  size="sm"
                  className="rounded-full px-3 py-1 text-xs"
                  disabled={walletDisabled}
                >
                  @{alias}
                </Button>
              ))}
            </div>
            {resolvedProfile ? (
              <p className="text-xs text-muted-foreground">
                Resolved:{" "}
                {resolvedProfile.displayName ?? resolvedProfile.alias ?? resolvedProfile.accountId}
                {resolvedProfile.alias ? ` · @${resolvedProfile.alias}` : ""}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground">Connection channel</label>
            <select
              value={selectedConnectionId}
              onChange={handleConnectionChange}
              disabled={walletDisabled}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
            >
              {connections.map((connection) => (
                <option key={connection.connectionTopicId} value={connection.connectionTopicId}>
                  {connection.contactDisplayName ??
                    connection.contactAlias ??
                    connection.contactAccountId}{" "}
                  · {connection.connectionTopicId}
                </option>
              ))}
            </select>
            {selectedConnection ? (
              <p className="text-xs text-muted-foreground">
                Chat with{" "}
                {selectedConnection.contactDisplayName ??
                  selectedConnection.contactAlias ??
                  selectedConnection.contactAccountId}
              </p>
            ) : null}
          </div>
        )}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">
          {mode === "direct" ? "Connection note (optional)" : "Message"}
        </label>
        <Textarea
          value={message}
          onChange={handleMessageChange}
          className="min-h-[120px]"
          disabled={walletDisabled}
          placeholder={
            mode === "direct"
              ? "Share context or intent for the connection"
              : "Say hello or share coordination details"
          }
        />
      </div>
      {mode === "direct" && status === "resolving" ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner size="sm" /> Looking up profile…
        </p>
      ) : null}
      {statusMessage ? (
        <p className="text-sm text-muted-foreground">{statusMessage}</p>
      ) : null}
      <Button
        type="submit"
        disabled={walletDisabled || !isReady || status !== "idle"}
        className="rounded-full bg-gradient-to-r from-holBlue to-holPurple px-5 py-2 font-semibold text-white shadow-lg shadow-holBlue/25 ring-1 ring-holBlue/40 hover:shadow-holPurple/35"
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
      </Button>
      {!isReady ? (
        <p className="text-xs text-muted-foreground">
          {mode === "direct"
            ? "Resolve a contact and ensure your identity has published inbound & outbound topics."
            : "Select a connection channel to start chatting."}
        </p>
      ) : null}
      </form>
    </AuthRequired>
  );
}
