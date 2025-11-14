"use client";

import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/providers/toast-provider";

const createPetalSchema = z.object({
  alias: z
    .string()
    .trim()
    .min(3, "Alias must be at least 3 characters")
    .max(40, "Alias too long")
    .regex(/^[a-z0-9-]+$/i, "Only letters, numbers, and dashes allowed"),
  basePublicKey: z
    .string()
    .trim()
    .min(64, "Wallet public key unavailable. Reconnect and try again."),
  initialBalance: z
    .number()
    .min(0.1, "Initial balance should be at least 0.1 ℏ")
    .max(1000, "Initial balance is unusually high"),
  maxAssociations: z
    .number()
    .int()
    .min(0)
    .max(50)
    .optional(),
});

export type CreatePetalValues = z.infer<typeof createPetalSchema>;

type SubmitState = "idle" | "submitting";

type PetalCreateFormProps = {
  onCreate: (values: CreatePetalValues) => Promise<void>;
  baseAccountId: string | null;
  basePublicKey: string | null;
};

export function PetalCreateForm({ onCreate, baseAccountId, basePublicKey }: PetalCreateFormProps) {
  const [alias, setAlias] = useState("");
  const [derivedPublicKey, setDerivedPublicKey] = useState(basePublicKey ?? "");
  const [initialBalance, setInitialBalance] = useState<string>("1");
  const [maxAssociations, setMaxAssociations] = useState<string>("0");
  const [status, setStatus] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);
  const { pushToast } = useToast();

  useEffect(() => {
    setDerivedPublicKey(basePublicKey ?? "");
  }, [basePublicKey]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const parsedInitial = Number.parseFloat(initialBalance);
    const parsedAssociations = maxAssociations
      ? Number.parseInt(maxAssociations, 10)
      : undefined;

    const parseResult = createPetalSchema.safeParse({
      alias,
      basePublicKey: derivedPublicKey,
      initialBalance: Number.isNaN(parsedInitial) ? 0 : parsedInitial,
      maxAssociations: Number.isNaN(parsedAssociations ?? NaN)
        ? undefined
        : parsedAssociations,
    });

    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      setError(issue?.message ?? "Invalid input");
      return;
    }

    setStatus("submitting");
    try {
      await onCreate(parseResult.data);
      setAlias("");
      setInitialBalance("1");
      setMaxAssociations("0");
      pushToast({ title: "Petal created", variant: "success" });
    } catch (err) {
      console.error("Petal creation failed", err);
      setError(err instanceof Error ? err.message : "Failed to create petal");
      pushToast({
        title: "Petal creation failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setStatus("idle");
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-700">Petal alias</span>
          <input
            type="text"
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            placeholder="project-alice"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
          <span className="text-xs text-slate-500">
            Lowercase alias stored in the petal memo and profile registry.
          </span>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-700">Initial balance (ℏ)</span>
          <input
            type="number"
            min="0"
            step="0.1"
            value={initialBalance}
            onChange={(event) => setInitialBalance(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          />
          <span className="text-xs text-slate-500">
            Seed amount transferred from the base account during creation.
          </span>
        </label>
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">Base account public key</span>
        <input
          type="text"
          value={derivedPublicKey}
          readOnly
          className="w-full rounded-md border border-slate-300 bg-slate-100 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
        <span className="text-xs text-slate-500">
          Automatically sourced from the connected base account for HCS-15 compliance.
        </span>
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-slate-700">
          Max automatic token associations
        </span>
        <input
          type="number"
          min="0"
          max="50"
          value={maxAssociations}
          onChange={(event) => setMaxAssociations(event.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
        />
        <span className="text-xs text-slate-500">
          Optional limit for automatic token associations on the new account.
        </span>
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {baseAccountId ? (
        <p className="text-xs text-slate-500">
          Base account: <span className="font-medium">{baseAccountId}</span>
        </p>
      ) : (
        <p className="text-xs text-amber-600">
          Connect your wallet to select the base HCS-15 account before creating petals.
        </p>
      )}
      <button
        type="submit"
        disabled={status === "submitting" || !derivedPublicKey}
        className="inline-flex items-center justify-center rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "submitting" ? (
          <span className="flex items-center gap-2">
            <Spinner size="sm" /> Creating…
          </span>
        ) : (
          "Create petal"
        )}
      </button>
    </form>
  );
}
