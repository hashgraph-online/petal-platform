"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { z } from "zod";
import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/providers/toast-provider";
import { getLogger } from "@/lib/logger";

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
  const logger = getLogger("petal-create-form");
  const [alias, setAlias] = useState("");
  const [derivedPublicKey, setDerivedPublicKey] = useState(basePublicKey ?? "");
  const [initialBalance, setInitialBalance] = useState<string>("1");
  const [maxAssociations, setMaxAssociations] = useState<string>("0");
  const [status, setStatus] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);
  const { pushToast } = useToast();
  const walletDisabled = !baseAccountId;

  useEffect(() => {
    setDerivedPublicKey(basePublicKey ?? "");
  }, [basePublicKey]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (walletDisabled) {
      const message = "Connect your wallet before creating a petal.";
      setError(message);
      pushToast({ title: "Wallet required", description: message, variant: "error" });
      return;
    }

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
      logger.error("Petal creation failed", err);
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

  const handleAliasChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setAlias(event.target.value);
    },
    [],
  );

  const handleInitialBalanceChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setInitialBalance(event.target.value);
    },
    [],
  );

  const handleMaxAssociationsChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setMaxAssociations(event.target.value);
    },
    [],
  );

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">Petal alias</span>
          <Input
            type="text"
            value={alias}
            onChange={handleAliasChange}
            placeholder="project-alice"
            disabled={walletDisabled}
          />
          <span className="text-xs text-muted-foreground">
            Lowercase alias stored in the petal memo and profile registry.
          </span>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">Initial balance (ℏ)</span>
          <Input
            type="number"
            min="0"
            step="0.1"
            value={initialBalance}
            onChange={handleInitialBalanceChange}
            disabled={walletDisabled}
          />
          <span className="text-xs text-muted-foreground">
            Seed amount transferred from the base account during creation.
          </span>
        </label>
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">Base account public key</span>
        <Input
          type="text"
          value={derivedPublicKey}
          readOnly
          className="bg-muted"
          disabled={walletDisabled}
        />
        <span className="text-xs text-muted-foreground">
          Automatically sourced from the connected base account for HCS-15 compliance.
        </span>
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-foreground">
          Max automatic token associations
        </span>
        <Input
          type="number"
          min="0"
          max="50"
          value={maxAssociations}
          onChange={handleMaxAssociationsChange}
          disabled={walletDisabled}
        />
        <span className="text-xs text-muted-foreground">
          Optional limit for automatic token associations on the new account.
        </span>
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {baseAccountId ? (
        <p className="text-xs text-muted-foreground">
          Base account: <span className="font-medium">{baseAccountId}</span>
        </p>
      ) : (
        <p className="text-xs text-amber-600">
          Connect your wallet to select the base HCS-15 account before creating petals.
        </p>
      )}
      <Button
        type="submit"
        disabled={walletDisabled || status === "submitting" || !derivedPublicKey}
        className="rounded-full bg-gradient-to-r from-holBlue to-holPurple px-5 py-2 font-semibold text-white shadow-lg shadow-holBlue/25 ring-1 ring-holBlue/40 hover:shadow-holPurple/35"
      >
        {status === "submitting" ? (
          <span className="flex items-center gap-2">
            <Spinner size="sm" /> Creating…
          </span>
        ) : (
          "Create petal"
        )}
      </Button>
    </form>
  );
}
