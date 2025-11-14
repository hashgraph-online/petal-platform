"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { searchProfileByAlias, type RegistryProfile } from "@/lib/hedera/registry";
import { useIdentity } from "@/providers/identity-provider";
import { useWallet } from "@/providers/wallet-provider";
import { useFlora } from "@/providers/flora-provider";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/providers/toast-provider";

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
  const { activeIdentity } = useIdentity();
  const { signer } = useWallet();
  const { createFlora } = useFlora();

  const [name, setName] = useState("");
  const [aliasInput, setAliasInput] = useState("");
  const [invitees, setInvitees] = useState<PendingInvitee[]>([]);
  const [status, setStatus] = useState<WizardState>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const { pushToast } = useToast();

  const canCreate = useMemo(() => {
    return Boolean(name.trim() && invitees.length > 0 && signer && activeIdentity);
  }, [name, invitees.length, signer, activeIdentity]);

  async function handleAddInvitee(event?: React.FormEvent | React.MouseEvent) {
    event?.preventDefault?.();
    setStatusMessage(null);

    const parsedAlias = aliasSchema.safeParse(aliasInput);
    if (!parsedAlias.success) {
      setStatusMessage(parsedAlias.error.issues[0]?.message ?? "Invalid alias");
      return;
    }

    setStatus("resolving");
    try {
      const profile = await searchProfileByAlias(parsedAlias.data.toLowerCase());
      if (!profile || !profile.inboundTopicId) {
        setStatusMessage("Profile not found or missing inbound topic");
        return;
      }
      setInvitees((current) => {
        const exists = current.some((item) => item.profile.accountId === profile.accountId);
        if (exists) {
          setStatusMessage("Invitee already added");
          return current;
        }
        return [...current, { alias: parsedAlias.data.toLowerCase(), profile }];
      });
      setAliasInput("");
      pushToast({ title: "Invitee added", variant: "success" });
    } catch (error) {
      console.error("Failed to resolve alias", error);
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
      console.error("Flora creation failed", error);
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
    <form className="space-y-4" onSubmit={handleCreateFlora}>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-slate-700">Flora name</label>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          placeholder="Agent coordination group"
        />
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-700">Invite members</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={aliasInput}
            onChange={(event) => setAliasInput(event.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            placeholder="alice-agent"
          />
          <button
            type="button"
            className="rounded-full bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={status === "resolving"}
            onClick={handleAddInvitee}
          >
            {status === "resolving" ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" /> Resolving…
              </span>
            ) : (
              "Add"
            )}
          </button>
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
                    onClick={() =>
                      setInvitees((current) =>
                        current.filter((item) => item.profile.accountId !== invitee.profile.accountId),
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

      {statusMessage ? (
        <p className="text-sm text-slate-600">{statusMessage}</p>
      ) : null}

      <button
        type="submit"
        className="inline-flex items-center justify-center rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={!canCreate || status === "creating"}
      >
        {status === "creating" ? (
          <span className="flex items-center gap-2">
            <Spinner size="sm" /> Creating…
          </span>
        ) : (
          "Create flora"
        )}
      </button>
      {!signer ? (
        <p className="text-xs text-slate-500">Connect your wallet to create a flora.</p>
      ) : null}
    </form>
  );
}
