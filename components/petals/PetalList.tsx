"use client";

import { Fragment, useCallback } from "react";
import type { PetalRecord } from "@/lib/hedera/petals";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function formatHbar(amount?: number): string {
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return "—";
  }
  return `${amount.toFixed(2)} ℏ`;
}

type PetalListProps = {
  petals: PetalRecord[];
  activeAccountId: string | null;
  actionsEnabled: boolean;
  onActivate: (accountId: string) => Promise<void>;
  onManage?: (accountId: string) => void;
};

export function PetalList({
  petals,
  activeAccountId,
  actionsEnabled,
  onActivate,
  onManage,
}: PetalListProps) {
  if (petals.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-border bg-muted text-sm text-muted-foreground">
        No petals created yet.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {petals.map((petal) => (
        <PetalListItem
          key={petal.accountId}
          petal={petal}
          isActive={petal.accountId === activeAccountId}
          actionsEnabled={actionsEnabled}
          onActivate={onActivate}
          onManage={onManage}
        />
      ))}
    </ul>
  );
}

type PetalListItemProps = {
  petal: PetalRecord;
  isActive: boolean;
  actionsEnabled: boolean;
  onActivate: (accountId: string) => Promise<void>;
  onManage?: (accountId: string) => void;
};

function PetalListItem({
  petal,
  isActive,
  actionsEnabled,
  onActivate,
  onManage,
}: PetalListItemProps) {
  const handleActivate = useCallback(() => {
    void onActivate(petal.accountId);
  }, [onActivate, petal.accountId]);

  const handleManage = useCallback(() => {
    onManage?.(petal.accountId);
  }, [onManage, petal.accountId]);

  return (
    <li>
      <Card className="rounded-xl p-4 shadow-md backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground" title={petal.accountId}>
              {petal.alias ?? petal.accountId}
            </p>
            <p className="text-xs text-muted-foreground">
              {petal.displayName ?? petal.accountId}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant={petal.hasProfile ? "success" : "warning"} className="text-[11px]">
                {petal.hasProfile ? "Profile linked" : "Profile incomplete"}
              </Badge>
              {petal.verified ? (
                <Badge variant="outline" className="border-holBlue/40 text-holBlue text-[11px]">
                  Key verified
                </Badge>
              ) : null}
            </div>
            <dl className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
              <Fragment>
                <div>
                  <dt className="font-medium text-muted-foreground">Memo</dt>
                  <dd>{petal.memo ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">Balance</dt>
                  <dd>{formatHbar(petal.balanceHbar)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">Verified</dt>
                  <dd>{petal.verified ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-muted-foreground">Created</dt>
                  <dd>{new Date(petal.createdAt).toLocaleString()}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="font-medium text-muted-foreground">Inbound topic</dt>
                  <dd>{petal.inboundTopicId ?? "—"}</dd>
                </div>
              </Fragment>
            </dl>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleActivate}
                disabled={!actionsEnabled}
                variant={isActive ? "secondary" : "default"}
                size="sm"
                className={`rounded-full px-4 ${isActive ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200" : ""}`}
              >
                {isActive ? "Active" : "Activate"}
              </Button>
              {onManage ? (
                <Button
                  type="button"
                  onClick={handleManage}
                  disabled={!actionsEnabled}
                  variant="outline"
                  size="sm"
                  className="rounded-full px-4"
                >
                  Manage profile
                </Button>
              ) : null}
            </div>
            <span className="text-xs text-muted-foreground">
              {isActive ? "Current messaging identity" : "Switch to act as this petal"}
            </span>
          </div>
        </div>
      </Card>
    </li>
  );
}
