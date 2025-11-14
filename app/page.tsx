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
  {
    href: "/flora",
    title: "Floras",
    description:
      "Coordinate multi-party actions through HCS-16 communication, tx, and state topics.",
  },
];

export default function Home() {
  return (
    <section className="space-y-10">
      <header className="space-y-3">
        <p className="text-sm font-medium text-violet-600">Agent Toolkit</p>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
          Build on Hedera with interoperable identities and coordination flows.
        </h1>
        <p className="max-w-3xl text-base text-slate-600">
          The Petal Platform stitches together HCS-11 profiles, HCS-15 petals,
          HCS-10 messaging, and HCS-16 flora standards. Use the modules below to
          configure identities, exchange secure messages, and spin up
          multi-party coordination spaces.
        </p>
      </header>
      <div className="grid gap-6 md:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="block rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md"
          >
            <h2 className="text-2xl font-semibold text-slate-900">
              {section.title}
            </h2>
            <p className="mt-3 text-sm text-slate-600">{section.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
