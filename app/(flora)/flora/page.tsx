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

export default function FloraPage() {
  const { floras, invites, acceptInvite, declineInvite, toggleMute, isMuted } = useFlora();
  const { signer } = useWallet();
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
      <header className="space-y-2">
        <p className="text-sm font-medium text-violet-600">Coordination</p>
        <h1 className="text-3xl font-semibold tracking-tight">Flora Groups</h1>
        <p className="max-w-2xl text-sm text-slate-600">
          Coordinate multi-party activity using HCS-16 flora topics for
          communication, proposals, and state tracking.
        </p>
      </header>
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
