"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  collectStorageSnapshot,
  clearAllStorage,
  type StorageSnapshotEntry,
} from "@/lib/storage";
import { useDebug } from "@/providers/debug-provider";
import { useToast } from "@/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "–";
  if (ms < 1_000) return "<1s";
  if (ms < 60_000) return `${Math.round(ms / 1_000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

export function CacheToolsButton() {
  const { debugMode } = useDebug();
  const { pushToast } = useToast();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<StorageSnapshotEntry[]>([]);
  const [referenceNow, setReferenceNow] = useState(() => Date.now());

  const hasEntries = entries.length > 0;

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!open) {
      return;
    }
    const snapshot = collectStorageSnapshot();
    setEntries(snapshot);
    setReferenceNow(Date.now());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open]);

  const totals = useMemo(() => {
    const count = entries.length;
    const namespaces = new Set(entries.map((entry) => entry.namespace));
    return { count, namespaces: namespaces.size };
  }, [entries]);

  const handleRefresh = useCallback(() => {
    setEntries(collectStorageSnapshot());
    setReferenceNow(Date.now());
  }, []);

  const handleClear = useCallback(() => {
    clearAllStorage();
    setEntries([]);
    setReferenceNow(Date.now());
    pushToast({ title: "Local caches cleared", variant: "success" });
  }, [pushToast]);

  const handleToggleOpen = useCallback(() => {
    setOpen((current) => !current);
  }, []);

  const handleCloseOverlay = useCallback(() => {
    setOpen(false);
  }, []);

  const handleDialogClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  }, []);

  if (!debugMode) {
    return null;
  }

  return (
    <div className="relative">
      <Button
        type="button"
        onClick={handleToggleOpen}
        variant="outline"
        size="sm"
        className="rounded-full px-3 py-1 text-xs font-semibold"
      >
        Cache Tools
      </Button>
      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-start justify-end bg-black/50 backdrop-blur-sm px-4 py-8"
              onClick={handleCloseOverlay}
              role="presentation"
            >
              <Card
                className="w-full max-w-md rounded-2xl p-4 shadow-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
                onClick={handleDialogClick}
                role="dialog"
                aria-modal="true"
                aria-label="Cache tools"
              >
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {totals.count} entries · {totals.namespaces} namespaces
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      onClick={handleRefresh}
                      variant="outline"
                      size="sm"
                      className="rounded-full px-2 py-1 text-[10px] font-semibold"
                    >
                      Refresh
                    </Button>
                    <Button
                      type="button"
                      onClick={handleClear}
                      variant="destructive"
                      size="sm"
                      className="rounded-full px-2 py-1 text-[10px] font-semibold"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto text-xs">
                  {hasEntries ? (
                    entries.map((entry) => (
                      <Card key={entry.key} className="rounded-lg p-2">
                        <p className="font-semibold text-foreground">{entry.namespace}</p>
                        <p className="text-[11px] text-muted-foreground">Key: {entry.key}</p>
                        {entry.accountId ? (
                          <p className="text-[11px] text-muted-foreground">
                            Account: {entry.accountId}
                          </p>
                        ) : null}
                        {entry.updatedAt ? (
                          <p className="text-[11px] text-muted-foreground">
                            Updated {formatDuration(referenceNow - entry.updatedAt)} ago
                          </p>
                        ) : null}
                        {entry.expiresAt ? (
                          <p className="text-[11px] text-muted-foreground">
                            Expires in {formatDuration(entry.expiresAt - referenceNow)}
                          </p>
                        ) : null}
                        <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-[10px] text-muted-foreground">
                          {JSON.stringify(entry.value, null, 2)}
                        </pre>
                      </Card>
                    ))
                  ) : (
                    <p className="rounded-lg border border-dashed border-border bg-muted p-3 text-muted-foreground">
                      No cached entries in the current session.
                    </p>
                  )}
                </div>
              </Card>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
