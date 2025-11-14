"use client";

import { useEffect, useMemo, useState } from "react";
import { FormShell } from "@/components/forms/form-shell";
import { PetalCreateForm, type CreatePetalValues } from "@/components/petals/PetalCreateForm";
import { PetalList } from "@/components/petals/PetalList";
import { ProfileForm, type ProfileFormValues } from "@/components/profile/ProfileForm";
import { useWallet } from "@/providers/wallet-provider";
import { useIdentity } from "@/providers/identity-provider";
import {
  createPetalAccount,
  fetchPetalRecord,
  updatePetalMemo,
  type PetalRecord,
} from "@/lib/hedera/petals";
import {
  createOrUpdateProfile,
  type ProfilePublishingEvent,
  type ProfilePublishingStep,
} from "@/lib/hedera/profile";
import { useTransactionFlow } from "@/providers/transaction-flow-provider";
import { getSignerPublicKeyString } from "@/lib/hedera/keys";

export default function PetalsPage() {
  const { signer } = useWallet();
  const {
    baseAccountId,
    petals,
    addPetal,
    updatePetal,
    activateIdentity,
    activeIdentity,
  } = useIdentity();
  const { startFlow } = useTransactionFlow();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedPetalId, setSelectedPetalId] = useState<string | null>(null);
  const [basePublicKey, setBasePublicKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function deriveBasePublicKey() {
      if (!signer) {
        if (!cancelled) {
          setBasePublicKey(null);
        }
        return;
      }

      const fallbackAccountId = baseAccountId ?? signer.getAccountId?.().toString() ?? null;
      const resolvedKey = await getSignerPublicKeyString(signer, fallbackAccountId);

      if (!cancelled) {
        setBasePublicKey((current) => {
          if (resolvedKey && resolvedKey.length > 0) {
            return resolvedKey;
          }
          return current;
        });
      }
    }

    void deriveBasePublicKey();

    return () => {
      cancelled = true;
    };
  }, [signer, baseAccountId]);

  const effectiveSelectedId = useMemo(() => {
    if (selectedPetalId && petals.some((petal) => petal.accountId === selectedPetalId)) {
      return selectedPetalId;
    }
    return petals[0]?.accountId ?? null;
  }, [selectedPetalId, petals]);

  const selectedPetal = useMemo(
    () => petals.find((petal) => petal.accountId === effectiveSelectedId) ?? null,
    [petals, effectiveSelectedId],
  );

  const profileInitialValues = useMemo<Partial<ProfileFormValues>>(() => {
    if (!selectedPetal) {
      return {};    
    }
    return {
      alias: selectedPetal.alias ?? "",
      displayName: selectedPetal.displayName ?? selectedPetal.alias ?? "",
      avatarUrl: "",
      bio: "",
    };
  }, [selectedPetal]);

  const handleCreatePetal = async (values: CreatePetalValues) => {
    if (!signer) {
      throw new Error("Connect your wallet before creating petals");
    }
    if (!baseAccountId) {
      throw new Error("Base account unavailable; reconnect your wallet");
    }
    if (!basePublicKey) {
      throw new Error("Unable to determine wallet public key for petal creation");
    }

    setStatusMessage(null);
    const alias = values.alias.toLowerCase();

    const flow = startFlow({
      title: "Creating petal account",
      subtitle: alias,
      steps: [
        { id: "create-account", label: "Create Hedera account" },
        { id: "memo", label: "Set account memo" },
        { id: "sync", label: "Sync mirror data" },
      ],
    });

    let activeStep: "create-account" | "memo" | "sync" = "create-account";

    try {
      flow.activateStep("create-account");
      const petalAccountId = await createPetalAccount({
        signer,
        baseAccountId,
        basePublicKey,
        alias,
        initialBalance: values.initialBalance,
        maxAutomaticTokenAssociations: values.maxAssociations,
      });
      flow.completeStep("create-account", `Account ${petalAccountId}`);

      activeStep = "memo";
      flow.activateStep("memo");
      await updatePetalMemo({
        signer,
        accountId: petalAccountId,
        memo: `Petal:${alias}`,
      });
      flow.completeStep("memo", "Memo updated");

      activeStep = "sync";
      flow.activateStep("sync");
      const record: PetalRecord = await fetchPetalRecord(
        petalAccountId,
        baseAccountId,
        alias,
      );
      flow.completeStep("sync", "Mirror data refreshed");

      addPetal(record);
      setSelectedPetalId(petalAccountId);
      setStatusMessage(`Petal ${petalAccountId} created and memo updated.`);
      flow.finish(`Petal ${petalAccountId} is ready.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create petal";
      flow.failStep(activeStep, message);
      throw error;
    }
  };

  const handleActivate = async (accountId: string) => {
    try {
      await activateIdentity(accountId);
      setStatusMessage(`Switched active identity to ${accountId}.`);
    } catch (error) {
      console.error("Failed to activate identity", error);
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Unable to activate the requested identity",
      );
    }
  };

  const handleProfileSubmit = async (values: ProfileFormValues) => {
    if (!selectedPetal) {
      throw new Error("Select a petal to manage its profile");
    }
    setStatusMessage(null);

    let profileFlowController: ReturnType<typeof startFlow> | null = null;
    let activeStep: ProfilePublishingStep = "ensure-inbound";

    try {
      const signerForPetal = await activateIdentity(selectedPetal.accountId);
      const payerAccountId = baseAccountId ?? selectedPetal.accountId;

      const profileFlowSteps: Array<{ id: ProfilePublishingStep; label: string }> = [
        { id: "ensure-inbound", label: "Ensure inbound topic" },
        { id: "ensure-outbound", label: "Ensure outbound topic" },
        { id: "inscribe-profile", label: "Upload profile document" },
        { id: "update-memo", label: "Update account memo" },
        { id: "verify-memo", label: "Verify memo on mirror" },
        { id: "publish-registry", label: "Publish registry entry" },
      ];

      profileFlowController = startFlow({
        title: "Publishing petal profile",
        subtitle: selectedPetal.accountId,
        steps: profileFlowSteps,
      });

      const handleEvent = (event: ProfilePublishingEvent) => {
        if (!profileFlowController) {
          return;
        }
        if (event.type === "start") {
          activeStep = event.step;
          profileFlowController.activateStep(event.step, event.message);
        } else if (event.type === "success") {
          profileFlowController.completeStep(event.step, event.message);
        } else {
          profileFlowController.skipStep(event.step, event.message);
        }
      };

      const result = await createOrUpdateProfile(
        {
          accountId: selectedPetal.accountId,
          alias: values.alias.toLowerCase(),
          displayName: values.displayName,
          avatarUrl: values.avatarUrl || undefined,
          bio: values.bio || undefined,
          inboundTopicId: selectedPetal.inboundTopicId,
        },
        signerForPetal,
        { payerAccountId, onStep: handleEvent },
      );

      updatePetal(selectedPetal.accountId, {
        alias: values.alias.toLowerCase(),
        displayName: values.displayName,
        inboundTopicId: result.inboundTopicId,
        outboundTopicId: result.outboundTopicId,
        hasProfile: true,
        profileReference: result.profileReference,
        profileTopicId: result.profileTopicId,
      });

      setStatusMessage("Petal profile published to the registry.");
      profileFlowController?.finish("Profile published successfully");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to publish profile";
      if (profileFlowController) {
        profileFlowController.failStep(activeStep, message);
      }
      console.error("Failed to publish petal profile", error);
      setStatusMessage(
        error instanceof Error
          ? error.message
          : "Unable to publish profile for this petal",
      );
      throw error;
    }
  };

  return (
    <section className="space-y-8">
      <header className="space-y-3 rounded-3xl border border-holNavy/25 bg-[rgba(18,24,54,0.9)] p-6 shadow-lg backdrop-blur">
        <p className="text-sm font-medium text-holBlue">Multi-account</p>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)]">Petal Accounts</h1>
        <p className="max-w-2xl text-sm text-[var(--text-primary)]/80">
          Create, fund, and switch between HCS-15 petal identities that share
          your key material while keeping assets and personas organized.
        </p>
        <p className="text-xs text-[var(--text-primary)]/70">
          HCS-15 powers petals by anchoring their account memos and registry entries to a shared key,
          so each persona stays portable while inheriting the base signature authority.
        </p>
        {statusMessage ? (
          <p className="text-sm text-holGreen">{statusMessage}</p>
        ) : null}
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <FormShell
          title="Petal Directory"
          description="Each petal appears with balance, memo, and active status."
        >
          <PetalList
            petals={petals}
            activeAccountId={activeIdentity?.accountId ?? null}
            onActivate={handleActivate}
            onManage={(accountId) => setSelectedPetalId(accountId)}
          />
        </FormShell>
        <div className="space-y-6">
          <FormShell
          title="Creation Workflow"
          description="Seed new accounts, configure memos, and link profiles."
        >
          <PetalCreateForm
            onCreate={handleCreatePetal}
            baseAccountId={baseAccountId ?? null}
            basePublicKey={basePublicKey}
          />
        </FormShell>
          <FormShell
            title="Petal Profile"
            description="Reuse the profile workflow to register this petal's identity."
          >
            {selectedPetal ? (
              <ProfileForm
                key={selectedPetal.accountId}
                initialValues={profileInitialValues}
                onSubmit={handleProfileSubmit}
              />
            ) : (
              <p className="rounded-md border border-dashed border-holNavy/30 bg-[rgba(18,24,54,0.7)] p-4 text-sm text-[var(--text-primary)]/75">
                Select a petal from the directory to manage its profile metadata.
              </p>
            )}
          </FormShell>
        </div>
      </div>
    </section>
  );
}
