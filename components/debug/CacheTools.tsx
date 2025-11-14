"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  collectStorageSnapshot,
  clearAllStorage,
  type StorageSnapshotEntry,
} from "@/lib/storage";
import { useDebug } from "@/providers/debug-provider";
import { useToast } from "@/providers/toast-provider";

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
  const [mounted, setMounted] = useState(false);
  const [entries, setEntries] = useState<StorageSnapshotEntry[]>([]);
  const [referenceNow, setReferenceNow] = useState(() => Date.now());

  const hasEntries = entries.length > 0;

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const handleRefresh = () => {
    setEntries(collectStorageSnapshot());
    setReferenceNow(Date.now());
  };

  const handleClear = () => {
    clearAllStorage();
    setEntries([]);
    setReferenceNow(Date.now());
    pushToast({ title: "Local caches cleared", variant: "success" });
  };

  if (!debugMode) {
    return null;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="rounded-full border border-holBlue/50 bg-[rgba(18,24,54,0.85)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)] shadow-sm transition hover:border-holPurple/60 hover:text-holPurple"
      >
        Cache Tools
      </button>
      {open && mounted
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-start justify-end bg-slate-950/60 px-4 py-8"
              onClick={() => setOpen(false)}
              role="presentation"
            >
              <div
                className="w-full max-w-md rounded-2xl border border-holNavy/30 bg-[rgba(12,18,47,0.95)] p-4 shadow-2xl backdrop-blur"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Cache tools"
              >
                <div className="flex items-center justify-between text-xs text-[var(--text-primary)]/80">
                  <span>
                    {totals.count} entries · {totals.namespaces} namespaces
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRefresh}
                      className="rounded-full border border-holBlue/50 bg-[rgba(18,24,54,0.85)] px-2 py-1 text-[10px] font-semibold text-[var(--text-primary)] hover:border-holPurple/60 hover:text-holPurple"
                    >
                      Refresh
                    </button>
                    <button
                      type="button"
                      onClick={handleClear}
                      className="rounded-full border border-rose-500/60 bg-rose-900/40 px-2 py-1 text-[10px] font-semibold text-rose-100 hover:border-rose-400"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="mt-3 max-h-64 space-y-2 overflow-y-auto text-xs">
                  {hasEntries ? (
                    entries.map((entry) => (
                      <div
                        key={entry.key}
                        className="rounded-lg border border-holNavy/25 bg-[rgba(18,24,54,0.9)] p-2"
                      >
                        <p className="font-semibold text-[var(--text-primary)]">{entry.namespace}</p>
                        <p className="text-[11px] text-[var(--text-primary)]/70">Key: {entry.key}</p>
                        {entry.accountId ? (
                          <p className="text-[11px] text-[var(--text-primary)]/70">Account: {entry.accountId}</p>
                        ) : null}
                        {entry.updatedAt ? (
                          <p className="text-[11px] text-[var(--text-primary)]/70">
                            Updated {formatDuration(referenceNow - entry.updatedAt)} ago
                          </p>
                        ) : null}
                        {entry.expiresAt ? (
                          <p className="text-[11px] text-[var(--text-primary)]/70">
                            Expires in {formatDuration(entry.expiresAt - referenceNow)}
                          </p>
                        ) : null}
                        <pre className="mt-1 overflow-x-auto rounded bg-[rgba(12,18,47,0.9)] p-2 text-[10px] text-[var(--text-primary)]/80">
                          {JSON.stringify(entry.value, null, 2)}
                        </pre>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-lg border border-dashed border-holNavy/25 bg-[rgba(18,24,54,0.8)] p-3 text-[var(--text-primary)]/70">
                      No cached entries in the current session.
                    </p>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
