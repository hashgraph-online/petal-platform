"use client";

import { useEffect, useMemo, useState } from "react";
import { FormShell } from "@/components/forms/form-shell";
import { FloraDirectory } from "@/components/flora/FloraDirectory";
import { FloraInvites } from "@/components/flora/FloraInvites";
import { NewFloraWizard } from "@/components/flora/NewFloraWizard";
import { FloraDashboard } from "@/components/flora/FloraDashboard";
import { useFlora } from "@/providers/flora-provider";
import { useWallet } from "@/providers/wallet-provider";
import { useIdentity } from "@/providers/identity-provider";
import { useToast } from "@/providers/toast-provider";
import { Card } from "@/components/ui/card";
import { AccountId } from "@hashgraph/sdk";

export default function FloraPage() {
  const { floras, invites, acceptInvite, declineInvite, toggleMute, isMuted } = useFlora();
  const { sdk, accountId: walletAccountId } = useWallet();
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
  const { activeIdentity } = useIdentity();
  const { pushToast } = useToast();
  const [processingInviteId, setProcessingInviteId] = useState<string | null>(null);
  const [selectedFloraId, setSelectedFloraId] = useState<string | null>(null);

  useEffect(() => {
    if (floras.length === 0) {
      setSelectedFloraId(null);
      return;
    }
    if (!selectedFloraId || !floras.some((flora) => flora.id === selectedFloraId)) {
      setSelectedFloraId(floras[0].id);
    }
  }, [floras, selectedFloraId]);

  const selectedFlora = useMemo(
    () => floras.find((flora) => flora.id === selectedFloraId) ?? null,
    [floras, selectedFloraId],
  );

  const handleAcceptInvite = async (inviteId: string) => {
    if (!signer) {
      return;
    }
    setProcessingInviteId(inviteId);
    try {
      await acceptInvite(inviteId, signer);
      pushToast({ title: "Invite accepted", variant: "success" });
    } finally {
      setProcessingInviteId(null);
    }
  };

  const handleDeclineInvite = (inviteId: string) => {
    declineInvite(inviteId);
    pushToast({ title: "Invite declined" });
  };

  return (
    <section className="space-y-8">
      <Card className="space-y-3 rounded-3xl p-6 shadow-lg backdrop-blur">
        <p className="text-sm font-medium text-brand-blue">Coordination</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Flora Groups
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Coordinate multi-party activity using HCS-16 flora topics for
          communication, proposals, and state tracking.
        </p>
        <p className="text-xs text-muted-foreground">
          HCS-16 links three coordinated topics (comm, transaction, state) so every flora keeps chat,
          proposals, and outcomes in sync for all members without a central server.
        </p>
      </Card>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <FormShell
            title="Flora Directory"
            description="List active and pending groups with membership metadata."
          >
            <FloraDirectory
              floras={floras}
              selectedId={selectedFloraId}
              onSelect={setSelectedFloraId}
            />
          </FormShell>
          <FormShell
            title="Pending Invites"
            description="Respond to incoming flora invitations from other agents."
          >
          <FloraInvites
            invites={invites}
            onAccept={handleAcceptInvite}
            onDecline={handleDeclineInvite}
            processingInviteId={processingInviteId}
          />
          </FormShell>
        </div>
        <FormShell
          title="New Flora"
          description="Invite members, create topics, and dispatch coordination requests."
        >
          <NewFloraWizard />
        </FormShell>
      </div>

      <FormShell
        title="Flora Activity"
        description="Inspect communication, proposals, and state updates for the selected flora."
      >
        <FloraDashboard
          flora={selectedFlora}
          signer={signer}
          accountId={selectedFlora && activeIdentity ? activeIdentity.accountId : null}
          muted={selectedFlora ? isMuted(selectedFlora.id) : false}
          onToggleMute={toggleMute}
        />
      </FormShell>
    </section>
  );
}
