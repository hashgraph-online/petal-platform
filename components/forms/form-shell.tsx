import type { ReactNode } from "react";

type FormShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
};

export function FormShell({ title, description, children, actions }: FormShellProps) {
  return (
    <section className="space-y-6 rounded-2xl border border-holNavy/25 bg-[rgba(18,24,54,0.85)] p-6 shadow-lg backdrop-blur">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
        {description ? (
          <p className="text-sm text-holNavy/60">{description}</p>
        ) : null}
      </header>
      <div className="space-y-4">{children}</div>
      {actions ? <div className="flex justify-end gap-3">{actions}</div> : null}
    </section>
  );
}
