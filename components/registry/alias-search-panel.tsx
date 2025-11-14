"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listRecentProfiles,
  searchProfileByAlias,
  type RegistryProfile,
} from "@/lib/hedera/registry";
import { topicExplorerUrl } from "@/config/topics";

function truncate(text: string, length = 32): string {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

type SearchState = "idle" | "searching";

type AliasSearchPanelProps = {
  onProfileResolved?: (profile: RegistryProfile | null) => void;
};

export function AliasSearchPanel({ onProfileResolved }: AliasSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegistryProfile | null>(null);
  const [recent, setRecent] = useState<RegistryProfile[]>([]);

  useEffect(() => {
    listRecentProfiles(8)
      .then(setRecent)
      .catch((err) => {
        console.warn("Failed to load recent profiles", err);
      });
  }, []);

  const hasResult = Boolean(result);

  const resultDetails = useMemo(() => {
    if (!result) {
      return null;
    }

    return [
      { label: "Account", value: result.accountId },
      { label: "Alias", value: result.alias ?? "—" },
      { label: "Display", value: result.displayName ?? "—" },
      { label: "Inbox", value: result.inboundTopicId ?? "—" },
    ];
  }, [result]);

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!query.trim()) {
      setError("Enter an alias to search");
      return;
    }

    setState("searching");
    setError(null);

    try {
      const profile = await searchProfileByAlias(query.trim());
      setResult(profile);
      onProfileResolved?.(profile);
      if (!profile) {
        setError("Profile not found in registry");
      }
    } catch (err) {
      console.error("Alias search failed", err);
      setError(err instanceof Error ? err.message : "Lookup failed");
      setResult(null);
      onProfileResolved?.(null);
    } finally {
      setState("idle");
    }
  }

  function handleUseRecent(profile: RegistryProfile) {
    setQuery(profile.alias ?? profile.accountId);
    setResult(profile);
    setError(null);
    onProfileResolved?.(profile);
  }

  return (
    <div className="space-y-6">
      <form className="space-y-3" onSubmit={handleSearch}>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-700">Search by alias</span>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="alice-agent"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
            <button
              type="submit"
              disabled={state === "searching"}
              className="inline-flex items-center justify-center rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {state === "searching" ? "Searching…" : "Search"}
            </button>
          </div>
          {error ? (
            <span className="text-xs text-red-600">{error}</span>
          ) : (
            <span className="text-xs text-slate-500">
              Looks up the alias in the HCS-2 registry backed by Hedera.
            </span>
          )}
        </label>
      </form>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-slate-700">Recent profiles</h3>
        <div className="flex flex-wrap gap-2">
          {recent.length === 0 ? (
            <span className="text-xs text-slate-500">No cached profiles yet.</span>
          ) : (
            recent.map((profile) => (
              <button
                key={`${profile.accountId}:${profile.alias ?? "none"}`}
                type="button"
                onClick={() => handleUseRecent(profile)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:border-violet-200 hover:text-violet-600"
              >
                {truncate(profile.alias ?? profile.accountId)}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        {hasResult ? (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {result?.displayName ?? "Unnamed profile"}
              </p>
              {result?.alias ? (
                <p className="text-xs text-slate-500">@{result.alias}</p>
              ) : null}
            </div>
            <dl className="grid gap-2 sm:grid-cols-2">
              {resultDetails?.map((item) => (
                <div key={item.label} className="space-y-1">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">
                    {item.label}
                  </dt>
                  <dd className="text-sm text-slate-700">{item.value}</dd>
                </div>
              ))}
            </dl>
            {result?.inboundTopicId ? (
              <a
                href={topicExplorerUrl(result.inboundTopicId)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-500"
              >
                View inbound topic ↗
              </a>
            ) : null}
          </div>
        ) : (
          <p>No profile selected. Use the search above to resolve an alias.</p>
        )}
      </div>
    </div>
  );
}
