"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ToastVariant = "default" | "success" | "error";

export type Toast = {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
};

const ToastContext = createContext<{
  pushToast: (toast: Omit<Toast, "id">) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = crypto.randomUUID();
    const variant = toast.variant ?? "default";
    setToasts((current) => [...current, { ...toast, id, variant }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 3500);
  }, []);

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto w-80 rounded-xl border bg-white px-4 py-3 shadow-lg ring-1 ring-black/5 ${
              toast.variant === "success"
                ? "border-emerald-200"
                : toast.variant === "error"
                ? "border-red-200"
                : "border-slate-200"
            }`}
          >
            <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
            {toast.description ? (
              <p className="mt-1 text-xs text-slate-600">{toast.description}</p>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
