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
        void err;
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
          <span className="text-sm font-medium text-holNavy">Search by alias</span>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="alice-agent"
              className="flex-1 rounded-md border border-holNavy/20 px-3 py-2 text-sm shadow-sm focus:border-holBlue focus:outline-none focus:ring-2 focus:ring-holBlue/30"
            />
            <button
              type="submit"
              disabled={state === "searching"}
              className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-holBlue to-holPurple px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-holBlue/25 ring-1 ring-holBlue/40 transition hover:shadow-holPurple/35 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {state === "searching" ? "Searching…" : "Search"}
            </button>
          </div>
          {error ? (
            <span className="text-xs text-red-600">{error}</span>
          ) : (
            <span className="text-xs text-holNavy/60">
              Looks up the alias in the HCS-2 registry backed by Hedera.
            </span>
          )}
        </label>
      </form>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-holNavy">Recent profiles</h3>
        <div className="flex flex-wrap gap-2">
          {recent.length === 0 ? (
            <span className="text-xs text-holNavy/60">No cached profiles yet.</span>
          ) : (
            recent.map((profile) => (
              <button
                key={`${profile.accountId}:${profile.alias ?? "none"}`}
                type="button"
                onClick={() => handleUseRecent(profile)}
                className="rounded-full border border-holNavy/10 bg-white px-3 py-1 text-xs font-medium text-holNavy/70 shadow-sm transition hover:border-holBlue/40 hover:text-holBlue"
              >
                {truncate(profile.alias ?? profile.accountId)}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="rounded-lg border border-holNavy/10 bg-white/80 p-4 text-sm text-holNavy/70 shadow-sm">
        {hasResult ? (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-holNavy">
                {result?.displayName ?? "Unnamed profile"}
              </p>
              {result?.alias ? (
                <p className="text-xs text-holNavy/60">@{result.alias}</p>
              ) : null}
            </div>
            <dl className="grid gap-2 sm:grid-cols-2">
              {resultDetails?.map((item) => (
                <div key={item.label} className="space-y-1">
                  <dt className="text-xs uppercase tracking-wide text-holNavy/60">
                    {item.label}
                  </dt>
                  <dd className="text-sm text-holNavy">{item.value}</dd>
                </div>
              ))}
            </dl>
            {result?.inboundTopicId ? (
              <a
                href={topicExplorerUrl(result.inboundTopicId)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-holBlue hover:text-holPurple"
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
