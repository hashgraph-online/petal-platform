import Link from "next/link";
import { Card } from "@/components/ui/card";

const sections = [
  {
    href: "/profile",
    title: "Profiles",
    description:
      "Publish HCS-11 identities, manage inbound topics, and sync registry entries.",
  },
  {
    href: "/petals",
    title: "Petal Accounts",
    description:
      "Create and activate HCS-15 petals to separate personas under one key.",
  },
  {
    href: "/messages",
    title: "Messaging",
    description:
      "Send and receive HCS-10 messages with registry-backed alias discovery.",
  },
];

export default function Home() {
  return (
    <section className="space-y-10">
      <Card className="space-y-4 rounded-3xl p-8 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-brand-blue/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-brand-blue">
            HOL
          </span>
          <span className="text-xs font-semibold text-muted-foreground">
            Built on Hedera
          </span>
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-brand-dark">
          HOL Petal Platform
        </h1>
        <p className="max-w-3xl text-base text-muted-foreground">
          Create profiles, new petal accounts, and messaging with HOL standards.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <a
            href="https://hol.org/docs/standards/hcs-15"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 font-semibold text-foreground transition hover:border-brand-purple/50 hover:text-brand-purple"
          >
            HCS-15 Standard ↗
          </a>
          <a
            href="https://hol.org/docs/standards/hcs-10"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 font-semibold text-foreground transition hover:border-brand-purple/50 hover:text-brand-purple"
          >
            HCS-10 Standard ↗
          </a>
          <a
            href="https://hol.org/docs/standards/hcs-16"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 font-semibold text-foreground transition hover:border-brand-purple/50 hover:text-brand-purple"
          >
            HCS-16 Standard ↗
          </a>
          <a
            href="https://github.com/hashgraph-online"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 font-semibold text-foreground transition hover:border-brand-purple/50 hover:text-brand-purple"
          >
            HOL on GitHub ↗
          </a>
        </div>
      </Card>
      <div className="grid gap-6 md:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group block rounded-2xl border border-border bg-card p-6 shadow-lg backdrop-blur transition hover:-translate-y-0.5 hover:border-brand-blue/50 hover:shadow-xl"
          >
            <h2 className="flex items-center gap-3 text-2xl font-semibold text-brand-dark">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-blue/15 text-sm font-bold text-brand-blue transition group-hover:bg-brand-purple/20 group-hover:text-brand-purple">
                {section.title.charAt(0)}
              </span>
              {section.title}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">{section.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
