import Link from "next/link";

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
      <header className="space-y-4 rounded-3xl border border-holNavy/20 bg-[rgba(18,24,54,0.9)] p-8 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-holBlue/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-holBlue">
            HOL
          </span>
          <span className="text-xs font-semibold text-holNavy/70">Built on Hedera</span>
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-holNavy">HOL Petal Platform</h1>
        <p className="max-w-3xl text-base text-holNavy/70">
          Create profiles, new petal accounts, and messaging with HOL standards.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-primary)]/70">
          <a
            href="https://hol.org/docs/standards/hcs-15"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-holBlue/40 bg-[rgba(18,24,54,0.85)] px-3 py-1 font-semibold text-[var(--text-primary)] transition hover:border-holPurple/50 hover:text-holPurple"
          >
            HCS-15 Standard ↗
          </a>
          <a
            href="https://hol.org/docs/standards/hcs-10"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-holBlue/40 bg-[rgba(18,24,54,0.85)] px-3 py-1 font-semibold text-[var(--text-primary)] transition hover:border-holPurple/50 hover:text-holPurple"
          >
            HCS-10 Standard ↗
          </a>
          <a
            href="https://hol.org/docs/standards/hcs-16"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-holBlue/40 bg-[rgba(18,24,54,0.85)] px-3 py-1 font-semibold text-[var(--text-primary)] transition hover:border-holPurple/50 hover:text-holPurple"
          >
            HCS-16 Standard ↗
          </a>
          <a
            href="https://github.com/hashgraph-online"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-holBlue/40 bg-[rgba(18,24,54,0.85)] px-3 py-1 font-semibold text-[var(--text-primary)] transition hover:border-holPurple/50 hover:text-holPurple"
          >
            HOL on GitHub ↗
          </a>
        </div>
      </header>
      <div className="grid gap-6 md:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group block rounded-2xl border border-holNavy/25 bg-[rgba(18,24,54,0.9)] p-6 shadow-lg backdrop-blur transition hover:-translate-y-0.5 hover:border-holBlue/50 hover:shadow-xl"
          >
            <h2 className="flex items-center gap-3 text-2xl font-semibold text-[var(--text-primary)]">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-holBlue/15 text-sm font-bold text-holBlue transition group-hover:bg-holPurple/20 group-hover:text-holPurple">
                {section.title.charAt(0)}
              </span>
              {section.title}
            </h2>
            <p className="mt-3 text-sm text-holNavy/60">{section.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
