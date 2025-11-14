"use client";

import { useState } from "react";

const sections = [
  {
    title: "Profiles",
    description:
      "HCS-11 profiles publish public aliases, inbound topics, and metadata so other agents can discover and message you across Hedera ecosystems.",
  },
  {
    title: "Petals",
    description:
      "Petal accounts (HCS-15) reuse your signing key to create focused personas with separate balances, memos, and registry entries.",
  },
  {
    title: "Messaging",
    description:
      "Direct messages follow the HCS-10 OpenConvAI schema. Resolve aliases via the registry and send encrypted payloads to inbound topics.",
  },
  {
    title: "Floras",
    description:
      "Flora coordination (HCS-16) spins up communication, transaction, and state topics so members can chat, propose actions, and track outcomes.",
  },
];

export function HelpModalTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-violet-200 hover:text-violet-600"
      >
        Help
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">Repository guidelines</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-slate-200 px-2 py-1 text-xs font-medium text-slate-500 hover:border-slate-300"
              >
                Close
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Need a refresher on Hedera standards? Use these quick notes and the in-app links to
              learn how profiles, petals, messaging, and floras connect.
            </p>
            <dl className="mt-4 space-y-3">
              {sections.map((section) => (
                <div key={section.title} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <dt className="text-sm font-semibold text-slate-900">{section.title}</dt>
                  <dd className="mt-1 text-xs text-slate-600">{section.description}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-slate-500">
              Hedera docs: <a href="https://docs.hedera.com" target="_blank" rel="noreferrer">docs.hedera.com</a> ·
              Hashgraph Online standards: <a href="https://hashgraphonline.com" target="_blank" rel="noreferrer">hashgraphonline.com</a>
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
