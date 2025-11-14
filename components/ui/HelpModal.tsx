"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-8"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl rounded-2xl border border-holNavy/30 bg-[rgba(12,18,47,0.95)] p-6 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Repository guidelines</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full border border-holBlue/50 bg-[rgba(18,24,54,0.85)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] transition hover:border-holPurple/60 hover:text-holPurple"
          >
            Close
          </button>
        </div>
        <p className="mt-2 text-sm text-[var(--text-primary)]/80">
          Need a refresher on Hedera standards? Use these quick notes and the in-app links to learn
          how profiles, petals, messaging, and floras connect.
        </p>
        <dl className="mt-4 space-y-3">
          {sections.map((section) => (
            <div
              key={section.title}
              className="rounded-lg border border-holNavy/25 bg-[rgba(18,24,54,0.9)] p-3 shadow-sm"
            >
              <dt className="text-sm font-semibold text-[var(--text-primary)]">{section.title}</dt>
              <dd className="mt-1 text-xs text-[var(--text-primary)]/80">{section.description}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-[var(--text-primary)]/70">
          Hedera docs: <a href="https://docs.hedera.com" target="_blank" rel="noreferrer">docs.hedera.com</a> ·
          HOL standards: <a href="https://hol.org" target="_blank" rel="noreferrer">hol.org</a>
        </p>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-holBlue/50 bg-[rgba(18,24,54,0.85)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)] shadow-sm transition hover:border-holPurple/60 hover:text-holPurple"
      >
        Help
      </button>
      {open && mounted ? createPortal(modalContent, document.body) : null}
    </>
  );
}
