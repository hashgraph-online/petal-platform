"use client";

import { useEffect, useMemo, useState } from "react";
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
        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-violet-200 hover:text-violet-600"
      >
        Cache Tools
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {totals.count} entries · {totals.namespaces} namespaces
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                className="rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:border-violet-200 hover:text-violet-600"
              >
                Refresh
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="rounded-full border border-red-200 px-2 py-1 text-[10px] font-semibold text-red-600 hover:border-red-300"
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
                  className="rounded-lg border border-slate-200 bg-slate-50 p-2"
                >
                  <p className="font-semibold text-slate-700">{entry.namespace}</p>
                  <p className="text-[11px] text-slate-500">Key: {entry.key}</p>
                  {entry.accountId ? (
                    <p className="text-[11px] text-slate-500">Account: {entry.accountId}</p>
                  ) : null}
                  {entry.updatedAt ? (
                    <p className="text-[11px] text-slate-500">
                      Updated {formatDuration(referenceNow - entry.updatedAt)} ago
                    </p>
                  ) : null}
                  {entry.expiresAt ? (
                    <p className="text-[11px] text-slate-500">
                      Expires in {formatDuration(entry.expiresAt - referenceNow)}
                    </p>
                  ) : null}
                  <pre className="mt-1 overflow-x-auto rounded bg-white p-2 text-[10px] text-slate-600">
                    {JSON.stringify(entry.value, null, 2)}
                  </pre>
                </div>
              ))
            ) : (
              <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-slate-500">
                No cached entries in the current session.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
