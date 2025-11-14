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
      <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/50 text-sm text-slate-500">
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
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p
                  className="text-sm font-semibold text-slate-900"
                  title={petal.accountId}
                >
                  {petal.alias ?? petal.accountId}
                </p>
                <p className="text-xs text-slate-500">{petal.displayName ?? petal.accountId}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                      petal.hasProfile
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {petal.hasProfile ? "Profile linked" : "Profile incomplete"}
                  </span>
                  {petal.verified ? (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                      Key verified
                    </span>
                  ) : null}
                </div>
                <dl className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                  <Fragment>
                    <div>
                      <dt className="font-medium text-slate-500">Memo</dt>
                      <dd>{petal.memo ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Balance</dt>
                      <dd>{formatHbar(petal.balanceHbar)}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Verified</dt>
                      <dd>{petal.verified ? "Yes" : "No"}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">Created</dt>
                      <dd>{new Date(petal.createdAt).toLocaleString()}</dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="font-medium text-slate-500">Inbound topic</dt>
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
                        ? "bg-emerald-100 text-emerald-700 focus-visible:outline-emerald-600"
                        : "bg-violet-600 text-white hover:bg-violet-500 focus-visible:outline-violet-600"
                    }`}
                  >
                    {isActive ? "Active" : "Activate"}
                  </button>
                  {onManage ? (
                    <button
                      type="button"
                      onClick={() => onManage(petal.accountId)}
                      className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-violet-200 hover:text-violet-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
                    >
                      Manage profile
                    </button>
                  ) : null}
                </div>
                <span className="text-xs text-slate-500">
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
