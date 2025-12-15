"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

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

  const handleOpen = useCallback(() => {
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-8"
      role="dialog"
      aria-modal="true"
    >
      <Card className="w-full max-w-xl rounded-2xl p-6 shadow-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-foreground">Repository guidelines</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClose}
            className="rounded-full px-3 py-1 text-xs"
          >
            Close
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Need a refresher on Hedera standards? Use these quick notes and the in-app links to learn
          how profiles, petals, messaging, and floras connect.
        </p>
        <dl className="mt-4 space-y-3">
          {sections.map((section) => (
            <Card key={section.title} className="rounded-lg p-3 shadow-sm">
              <dt className="text-sm font-semibold text-foreground">{section.title}</dt>
              <dd className="mt-1 text-xs text-muted-foreground">
                {section.description}
              </dd>
            </Card>
          ))}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Hedera docs: <a href="https://docs.hedera.com" target="_blank" rel="noreferrer">docs.hedera.com</a> ·
          HOL standards: <a href="https://hol.org" target="_blank" rel="noreferrer">hol.org</a>
        </p>
      </Card>
    </div>
  );

  return (
    <>
      <Button
        type="button"
        onClick={handleOpen}
        variant="outline"
        size="sm"
        className="rounded-full px-3 py-1 text-xs font-semibold"
      >
        Help
      </Button>
      {open ? createPortal(modalContent, document.body) : null}
    </>
  );
}
