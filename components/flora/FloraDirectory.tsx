"use client";

import type { FloraRecord } from "@/providers/flora-provider";
import { topicExplorerUrl } from "@/config/topics";

function formatTopicId(id: string) {
  return `${id.slice(0, 10)}…${id.slice(-6)}`;
}

type FloraDirectoryProps = {
  floras: FloraRecord[];
  selectedId: string | null;
  onSelect: (floraId: string) => void;
};

export function FloraDirectory({ floras, selectedId, onSelect }: FloraDirectoryProps) {
  if (floras.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/50 text-sm text-slate-500">
        No floras yet. Create one to coordinate with other agents.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {floras.map((flora) => (
        <li
          key={flora.id}
          className={`rounded-xl border bg-white p-4 shadow-sm transition ${
            selectedId === flora.id
              ? "border-holBlue/50 ring-2 ring-holBlue/30"
              : "border-holNavy/10"
          }`}
          role="button"
          tabIndex={0}
          onClick={() => onSelect(flora.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              onSelect(flora.id);
            }
          }}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-lg font-semibold text-holNavy">{flora.name}</p>
              <p className="text-xs uppercase tracking-wide text-holNavy/60">
                {flora.status === "pending" ? "Pending" : "Active"}
              </p>
              <dl className="mt-2 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-holNavy/60">Communication topic</dt>
                  <dd>
                    <a
                      href={topicExplorerUrl(flora.topics.communication)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-holBlue hover:text-holPurple"
                    >
                      {formatTopicId(flora.topics.communication)}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-holNavy/60">Transaction topic</dt>
                  <dd>{formatTopicId(flora.topics.transaction)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-holNavy/60">State topic</dt>
                  <dd>{formatTopicId(flora.topics.state)}</dd>
                </div>
                <div>
                  <dt className="font-medium text-holNavy/60">Members</dt>
                  <dd className="flex flex-wrap gap-2">
                    {flora.members.map((member) => (
                      <span
                        key={member.accountId}
                        className="rounded-full bg-holBlue/10 px-2 py-0.5 text-[11px] font-medium text-holNavy"
                        title={member.accountId}
                      >
                        {member.alias || member.accountId}
                      </span>
                    ))}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="rounded-full bg-holBlue/10 px-3 py-1 text-xs font-semibold text-holNavy/80">
              Initiated by {flora.initiatorAccountId}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
