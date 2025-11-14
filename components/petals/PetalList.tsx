"use client";

import { Fragment } from "react";
import type { PetalRecord } from "@/lib/hedera/petals";

function formatHbar(amount?: number): string {
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return "—";
  }
  return `${amount.toFixed(2)} ℏ`;
}

type PetalListProps = {
  petals: PetalRecord[];
  activeAccountId: string | null;
  onActivate: (accountId: string) => Promise<void>;
  onManage?: (accountId: string) => void;
};

export function PetalList({ petals, activeAccountId, onActivate, onManage }: PetalListProps) {
  if (petals.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-holNavy/30 bg-[rgba(26,34,70,0.6)] text-sm text-holNavy/50">
        No petals created yet.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {petals.map((petal) => {
        const isActive = petal.accountId === activeAccountId;
        return (
          <li
            key={petal.accountId}
            className="rounded-xl border border-holNavy/25 bg-[rgba(18,24,54,0.9)] p-4 shadow-md backdrop-blur"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p
                  className="text-sm font-semibold text-[var(--text-primary)]"
                  title={petal.accountId}
                >
                  {petal.alias ?? petal.accountId}
                </p>
                <p className="text-xs text-holNavy/60">{petal.displayName ?? petal.accountId}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                      petal.hasProfile
                        ? "bg-holGreen/20 text-white"
                        : "bg-holPurple/20 text-[var(--text-primary)]"
                    }`}
                  >
                    {petal.hasProfile ? "Profile linked" : "Profile incomplete"}
                  </span>
                  {petal.verified ? (
                    <span className="inline-flex items-center rounded-full bg-holBlue/20 px-2.5 py-0.5 text-[11px] font-medium text-white">
                      Key verified
                    </span>
                  ) : null}
                </div>
                <dl className="mt-2 grid gap-2 text-xs text-holNavy/60 sm:grid-cols-2">
                  <Fragment>
                    <div>
                      <dt className="font-medium text-holNavy/60">Memo</dt>
                      <dd>{petal.memo ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-holNavy/60">Balance</dt>
                      <dd>{formatHbar(petal.balanceHbar)}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-holNavy/60">Verified</dt>
                      <dd>{petal.verified ? "Yes" : "No"}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-holNavy/60">Created</dt>
                      <dd>{new Date(petal.createdAt).toLocaleString()}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="font-medium text-holNavy/60">Inbound topic</dt>
                      <dd>{petal.inboundTopicId ?? "—"}</dd>
                    </div>
                  </Fragment>
                </dl>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await onActivate(petal.accountId);
                    }}
                    className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                      isActive
                        ? "bg-holGreen/20 text-holNavy focus-visible:outline-holGreen"
                        : "bg-holBlue text-white hover:bg-holPurple focus-visible:outline-holBlue"
                    }`}
                  >
                    {isActive ? "Active" : "Activate"}
                  </button>
                  {onManage ? (
                    <button
                      type="button"
                      onClick={() => onManage(petal.accountId)}
                      className="inline-flex items-center justify-center rounded-full border border-holNavy/10 px-4 py-2 text-sm font-semibold text-holNavy/70 shadow-sm transition hover:border-holBlue/40 hover:text-holBlue focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-holBlue"
                    >
                      Manage profile
                    </button>
                  ) : null}
                </div>
                <span className="text-xs text-holNavy/60">
                  {isActive
                    ? "Current messaging identity"
                    : "Switch to act as this petal"}
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
