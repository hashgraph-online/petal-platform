import type { ReactNode } from "react";

type FormShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
};

export function FormShell({ title, description, children, actions }: FormShellProps) {
  return (
    <section className="space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {description ? (
          <p className="text-sm text-slate-600">{description}</p>
        ) : null}
      </header>
      <div className="space-y-4">{children}</div>
      {actions ? <div className="flex justify-end gap-3">{actions}</div> : null}
    </section>
  );
}
