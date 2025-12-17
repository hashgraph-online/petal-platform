"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { listRecentProfiles, type RegistryProfile } from "@/lib/hedera/registry";
import { resolveProfileByIdentifier, searchRegistryProfiles } from "@/lib/hedera/profile-lookup";
import { useIdentity } from "@/providers/identity-provider";
import { useWallet } from "@/providers/wallet-provider";
import { useFlora } from "@/providers/flora-provider";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/providers/toast-provider";
import { getLogger } from "@/lib/logger";
import { AuthRequired } from "@/components/auth/auth-required";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccountId } from "@hashgraph/sdk";

const aliasSchema = z
  .string()
  .trim()
  .min(3, "Alias must be at least 3 characters")
  .max(64, "Alias too long")
  .regex(/^[a-z0-9-]+$/i, "Use letters, numbers, or dashes");

const floraNameSchema = z
  .string()
  .trim()
  .min(3, "Provide a flora name")
  .max(80, "Name too long");

type PendingInvitee = {
  alias: string;
  profile: RegistryProfile;
};

type WizardState = "idle" | "resolving" | "creating";

export function NewFloraWizard() {
  const logger = getLogger("new-flora-wizard");
  const { activeIdentity } = useIdentity();
  const { sdk, accountId: walletAccountId, network } = useWallet();
  const signer = useMemo(() => {
    if (!sdk || !walletAccountId) {
      return null;
    }
    try {
      return sdk.dAppConnector.getSigner(AccountId.fromString(walletAccountId));
    } catch {
      return null;
    }
  }, [sdk, walletAccountId]);
  const { createFlora } = useFlora();
  const walletDisabled = !signer;

  const [name, setName] = useState("");
  const [aliasInput, setAliasInput] = useState("");
  const [invitees, setInvitees] = useState<PendingInvitee[]>([]);
  const [status, setStatus] = useState<WizardState>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [recentProfiles, setRecentProfiles] = useState<RegistryProfile[]>([]);
  const [suggestions, setSuggestions] = useState<RegistryProfile[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const { pushToast } = useToast();

  const canCreate = useMemo(() => {
    return Boolean(name.trim() && invitees.length > 0 && signer && activeIdentity);
  }, [name, invitees.length, signer, activeIdentity]);

  useEffect(() => {
    let cancelled = false;
    listRecentProfiles(24)
      .then((profiles) => {
        if (!cancelled) {
          setRecentProfiles(profiles.filter((profile) => Boolean(profile.alias)));
        }
      })
      .catch(() => {
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!suggestionsOpen) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    const query = aliasInput.trim().toLowerCase();
    if (!query) {
      setSuggestions(recentProfiles.slice(0, 10));
      setSuggestionsLoading(false);
      return;
    }

    if (query.length < 2) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    let cancelled = false;
    setSuggestionsLoading(true);

    const timer = setTimeout(() => {
      searchRegistryProfiles(query, { network, limit: 10 })
        .then((results) => {
          if (!cancelled) {
            setSuggestions(results);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSuggestions([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSuggestionsLoading(false);
          }
        });
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [aliasInput, network, recentProfiles, suggestionsOpen]);

  const addInvitee = useCallback(
    (alias: string, profile: RegistryProfile) => {
      setInvitees((current) => {
        const exists = current.some((item) => item.profile.accountId === profile.accountId);
        if (exists) {
          setStatusMessage("Invitee already added");
          return current;
        }
        return [...current, { alias, profile }];
      });
    },
    [],
  );

  async function handleAddInvitee(event?: React.FormEvent | React.MouseEvent) {
    event?.preventDefault?.();
    setStatusMessage(null);
    if (walletDisabled) {
      setStatusMessage("Connect your wallet to add invitees.");
      return;
    }

    const parsedAlias = aliasSchema.safeParse(aliasInput);
    if (!parsedAlias.success) {
      setStatusMessage(parsedAlias.error.issues[0]?.message ?? "Invalid alias");
      return;
    }

    setStatus("resolving");
    try {
      const profile = await resolveProfileByIdentifier(parsedAlias.data, {
        network,
        requireInboundTopic: true,
      });
      if (!profile) {
        setStatusMessage(
          "No matching profile with an inbound topic was found. Ask them to publish their HCS-11 profile first.",
        );
        return;
      }
      addInvitee(parsedAlias.data.toLowerCase(), profile);
      setAliasInput("");
      pushToast({ title: "Invitee added", variant: "success" });
    } catch (error) {
      logger.error("Failed to resolve alias", error);
      setStatusMessage(error instanceof Error ? error.message : "Lookup failed");
      pushToast({
        title: "Invite lookup failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setStatus("idle");
    }
  }

  const handleSuggestionPick = useCallback(
    (profile: RegistryProfile) => {
      const alias = profile.alias?.toLowerCase();
      if (!alias) {
        setStatusMessage("Selected profile is missing an alias.");
        return;
      }
      if (!profile.inboundTopicId) {
        setStatusMessage(
          "That profile is missing an inbound topic. Ask them to publish their HCS-11 profile again.",
        );
        return;
      }
      addInvitee(alias, profile);
      setAliasInput("");
      setSuggestionsOpen(false);
      pushToast({ title: "Invitee added", variant: "success" });
    },
    [addInvitee, pushToast],
  );

  const handleAliasInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setAliasInput(event.target.value);
    setStatusMessage(null);
    setSuggestionsOpen(true);
  }, []);

  const handleAliasInputBlur = useCallback(() => {
    setTimeout(() => {
      setSuggestionsOpen(false);
    }, 150);
  }, []);

  async function handleCreateFlora(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate || !signer || !activeIdentity) {
      setStatusMessage("Connect an identity and add invitees first");
      return;
    }

    const parsedName = floraNameSchema.safeParse(name);
    if (!parsedName.success) {
      setStatusMessage(parsedName.error.issues[0]?.message ?? "Invalid flora name");
      return;
    }

    setStatus("creating");
    setStatusMessage(null);

    try {
      await createFlora(
        parsedName.data,
        invitees.map((item) => item.profile),
        signer,
        activeIdentity.alias,
      );
      setName("");
      setInvitees([]);
      setStatusMessage("Flora requested. Awaiting member responses.");
      pushToast({ title: "Flora request sent", variant: "success" });
    } catch (error) {
      logger.error("Flora creation failed", error);
      setStatusMessage(error instanceof Error ? error.message : "Failed to create flora");
      pushToast({
        title: "Flora creation failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setStatus("idle");
    }
  }

  return (
    <AuthRequired
      enabled={!walletDisabled}
      title="Wallet required"
      description="Connect your wallet to create a flora."
    >
      <form className="space-y-4" onSubmit={handleCreateFlora}>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-holNavy">Flora name</label>
          <Input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={walletDisabled}
            className="border-holNavy/20 focus-visible:ring-holBlue/30"
            placeholder="Agent coordination group"
          />
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-holNavy">Invite members</p>
          <div className="relative">
            <div className="flex gap-2">
              <Input
                type="text"
                value={aliasInput}
                onChange={handleAliasInputChange}
                onFocus={() => setSuggestionsOpen(true)}
                onBlur={handleAliasInputBlur}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void handleAddInvitee(event);
                  }
                }}
                disabled={walletDisabled}
                className="flex-1 border-holNavy/20 focus-visible:ring-holBlue/30"
                placeholder="Search by alias (e.g. alice-agent)"
              />
              <Button
                type="button"
                className="rounded-full bg-holNavy px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-holPurple disabled:cursor-not-allowed disabled:opacity-60"
                disabled={walletDisabled || status === "resolving"}
                onClick={handleAddInvitee}
              >
                {status === "resolving" ? (
                  <span className="flex items-center gap-2">
                    <Spinner size="sm" /> Resolving…
                  </span>
                ) : (
                  "Add"
                )}
              </Button>
            </div>

            {suggestionsOpen ? (
              <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-center justify-between px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
                  <span>{suggestionsLoading ? "Searching registry…" : "Suggestions"}</span>
                  <span className="font-mono">{network}</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {suggestionsLoading ? (
                    <div className="flex items-center gap-2 px-3 py-3 text-sm text-gray-600 dark:text-gray-300">
                      <Spinner size="sm" /> Loading…
                    </div>
                  ) : suggestions.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-gray-600 dark:text-gray-300">
                      No matches yet. Try typing a longer alias.
                    </div>
                  ) : (
                    suggestions.map((profile) => (
                      <button
                        key={profile.accountId}
                        type="button"
                        onClick={() => handleSuggestionPick(profile)}
                        disabled={walletDisabled}
                        className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm transition hover:bg-gray-50 disabled:opacity-60 dark:hover:bg-gray-800"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-gray-900 dark:text-gray-50">
                            {profile.displayName ?? profile.alias ?? profile.accountId}
                          </span>
                          <span className="block truncate text-xs text-gray-600 dark:text-gray-300">
                            {profile.alias ? `@${profile.alias}` : ""} · {profile.accountId}
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
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            {invitees.length === 0 ? (
              <p className="text-xs text-slate-500">Add at least one member by alias.</p>
            ) : (
              <ul className="space-y-1">
                {invitees.map((invitee) => (
                  <li
                    key={invitee.profile.accountId}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    <span>
                      {invitee.profile.displayName || invitee.alias} · {invitee.profile.accountId}
                    </span>
                    <button
                      type="button"
                      className="text-xs font-medium text-red-600"
                      disabled={walletDisabled}
                      onClick={() =>
                        setInvitees((current) =>
                          current.filter(
                            (item) => item.profile.accountId !== invitee.profile.accountId,
                          ),
                        )
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {statusMessage ? <p className="text-sm text-holNavy/70">{statusMessage}</p> : null}

        <Button
          type="submit"
          className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-holBlue to-holPurple px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-holBlue/25 ring-1 ring-holBlue/40 transition hover:shadow-holPurple/35 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canCreate || status === "creating"}
        >
          {status === "creating" ? (
            <span className="flex items-center gap-2">
              <Spinner size="sm" /> Creating…
            </span>
          ) : (
            "Create flora"
          )}
        </Button>
      </form>
    </AuthRequired>
  );
}
