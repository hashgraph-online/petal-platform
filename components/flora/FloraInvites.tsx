"use client";

import type { FloraInvite } from "@/providers/flora-provider";
import { Spinner } from "@/components/ui/Spinner";

type FloraInvitesProps = {
  invites: FloraInvite[];
  onAccept: (inviteId: string) => Promise<void>;
  onDecline: (inviteId: string) => void;
  processingInviteId?: string | null;
};

export function FloraInvites({ invites, onAccept, onDecline, processingInviteId }: FloraInvitesProps) {
  if (invites.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No pending invites.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {invites.map((invite) => (
        <li key={invite.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">
            Flora invite: {invite.flora.name}
          </p>
          <p className="text-xs text-slate-500">From {invite.invitation.flora.initiator.accountId}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={processingInviteId === invite.id}
              onClick={() => onAccept(invite.id)}
            >
              {processingInviteId === invite.id ? (
                <span className="flex items-center gap-2">
                  <Spinner size="sm" /> Accepting…
                </span>
              ) : (
                "Accept"
              )}
            </button>
            <button
              type="button"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-red-200 hover:text-red-600"
              onClick={() => onDecline(invite.id)}
            >
              Decline
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
