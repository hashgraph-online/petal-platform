"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Spinner } from "@/components/ui/Spinner";

type TransactionStepStatus = "pending" | "active" | "completed" | "failed" | "skipped";

type TransactionFlowStage = "idle" | "in-progress" | "completed" | "failed";

type TransactionFlowStepConfig = {
  id: string;
  label: string;
  note?: string;
};

type TransactionFlowStepState = TransactionFlowStepConfig & {
  status: TransactionStepStatus;
  progressPercent?: number;
};

type TransactionFlowState = {
  id: number;
  title: string;
  subtitle?: string;
  stage: TransactionFlowStage;
  steps: TransactionFlowStepState[];
  isOpen: boolean;
  error?: string | null;
  resultNote?: string | null;
  dismissible: boolean;
};

type StartFlowArgs = {
  title: string;
  subtitle?: string;
  steps: TransactionFlowStepConfig[];
  dismissible?: boolean;
};

type FlowController = {
  activateStep: (id: string, note?: string) => void;
  setStepProgress: (id: string, progressPercent?: number, note?: string) => void;
  completeStep: (id: string, note?: string) => void;
  skipStep: (id: string, note?: string) => void;
  failStep: (id: string, error: string) => void;
  setSubtitle: (subtitle: string) => void;
  finish: (note?: string) => void;
};

type TransactionFlowContextValue = {
  startFlow: (args: StartFlowArgs) => FlowController;
  closeFlow: () => void;
  flow: TransactionFlowState | null;
};

const TransactionFlowContext = createContext<TransactionFlowContextValue | null>(null);

function updateStepState(
  prev: TransactionFlowState,
  stepId: string,
  updater: (step: TransactionFlowStepState) => TransactionFlowStepState,
): TransactionFlowState {
  return {
    ...prev,
    steps: prev.steps.map((step) => (step.id === stepId ? updater(step) : step)),
  };
}

export function TransactionFlowProvider({ children }: { children: ReactNode }) {
  const [flow, setFlow] = useState<TransactionFlowState | null>(null);
  const flowIdRef = useRef(0);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const closeFlow = useCallback(() => {
    clearCloseTimer();
    setFlow(null);
  }, [clearCloseTimer]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  const startFlow = useCallback(
    ({ title, subtitle, steps, dismissible = false }: StartFlowArgs): FlowController => {
      clearCloseTimer();
      const flowId = flowIdRef.current + 1;
      flowIdRef.current = flowId;

      setFlow({
        id: flowId,
        title,
        subtitle,
        stage: "in-progress",
        steps: steps.map((step) => ({ ...step, status: "pending" })),
        isOpen: true,
        error: null,
        resultNote: null,
        dismissible,
      });

      const guardedUpdate = (updater: (prev: TransactionFlowState) => TransactionFlowState) => {
        setFlow((prev) => {
          if (!prev || prev.id !== flowId) {
            return prev;
          }
          return updater(prev);
        });
      };

      const setStage = (stage: TransactionFlowStage, patch?: Partial<TransactionFlowState>) => {
        guardedUpdate((prev) => ({ ...prev, stage, ...patch }));
      };

      const scheduleAutoClose = () => {
        clearCloseTimer();
        closeTimerRef.current = setTimeout(() => {
          setFlow((prev) => {
            if (!prev || prev.id !== flowId) {
              return prev;
            }
            return { ...prev, isOpen: false };
          });
          closeTimerRef.current = setTimeout(() => {
            closeFlow();
          }, 400);
        }, 1600);
      };

      const updateStepHelper = (
        id: string,
        status: TransactionStepStatus,
        note?: string,
      ) => {
        guardedUpdate((prev) =>
          updateStepState(prev, id, (step) => ({
            ...step,
            status,
            note: note ?? step.note,
            progressPercent: status === "active" ? step.progressPercent : undefined,
          })),
        );
      };

      return {
        activateStep: (id, note) => updateStepHelper(id, "active", note),
        setStepProgress: (id, progressPercent, note) => {
          guardedUpdate((prev) =>
            updateStepState(prev, id, (step) => ({
              ...step,
              note: note ?? step.note,
              progressPercent:
                typeof progressPercent === "number" && Number.isFinite(progressPercent)
                  ? Math.max(0, Math.min(100, Math.round(progressPercent)))
                  : undefined,
            })),
          );
        },
        completeStep: (id, note) => updateStepHelper(id, "completed", note),
        skipStep: (id, note) => updateStepHelper(id, "skipped", note),
        failStep: (id, error) => {
          guardedUpdate((prev) => {
            const next = updateStepState(prev, id, (step) => ({
              ...step,
              status: "failed",
              note: error,
              progressPercent: undefined,
            }));
            return { ...next, stage: "failed", error };
          });
        },
        setSubtitle: (nextSubtitle) => {
          guardedUpdate((prev) => ({ ...prev, subtitle: nextSubtitle }));
        },
        finish: (note) => {
          setStage("completed", { resultNote: note ?? null, error: null });
          scheduleAutoClose();
        },
      };
    },
    [clearCloseTimer, closeFlow],
  );

  const contextValue = useMemo<TransactionFlowContextValue>(
    () => ({
      startFlow,
      closeFlow,
      flow,
    }),
    [startFlow, closeFlow, flow],
  );

  return (
    <TransactionFlowContext.Provider value={contextValue}>
      {children}
      <TransactionFlowOverlay />
    </TransactionFlowContext.Provider>
  );
}

export function useTransactionFlow(): TransactionFlowContextValue {
  const context = useContext(TransactionFlowContext);
  if (!context) {
    throw new Error("useTransactionFlow must be used within a TransactionFlowProvider");
  }
  return context;
}

function StatusIcon({ status }: { status: TransactionStepStatus }) {
  if (status === "active") {
    return <Spinner size="sm" />;
  }

  if (status === "completed") {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-semibold text-white">
        ✓
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-semibold text-white">
        !
      </span>
    );
  }

  if (status === "skipped") {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground">
        •
      </span>
    );
  }

  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground">
      •
    </span>
  );
}

function TransactionFlowOverlay() {
  const context = useContext(TransactionFlowContext);
  const flow = context?.flow ?? null;
  const closeFlow = context?.closeFlow;
  const canDismiss = flow ? flow.stage !== "in-progress" || flow.dismissible : false;
  const handleCloseClick = useCallback(() => {
    if (canDismiss) {
      closeFlow?.();
    }
  }, [canDismiss, closeFlow]);

  if (!context || !flow || !flow.isOpen) {
    return null;
  }

  return (
    <div
      data-hol-modal-backdrop="transaction-flow"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 px-3 sm:px-6 py-10 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md bg-white text-gray-900 rounded-xl shadow-2xl border border-gray-200 max-h-[85vh] overflow-y-auto dark:bg-gray-900 dark:text-gray-50 dark:border-gray-700">
        <div className="p-5 border-b border-gray-200 flex items-start justify-between gap-3 dark:border-gray-700">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-blue">Transaction flow</p>
            <h2 className="mt-1 text-lg font-semibold">{flow.title}</h2>
            {flow.subtitle ? (
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{flow.subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={handleCloseClick}
            disabled={!canDismiss}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed dark:text-gray-400 dark:hover:text-gray-100 dark:hover:bg-gray-800"
          >
            ✕
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 shadow-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
            Some steps can take a moment to finalize. If the step indicator moves or pauses on a
            transaction, check your wallet for a pending request and approve it to keep things moving.
          </p>
          <div className="space-y-3">
            {flow.steps.map((step) => (
              <div key={step.id} className="flex items-start gap-3">
                <span className="mt-0.5">
                  <StatusIcon status={step.status} />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium">{step.label}</p>
                  {step.note ? (
                    <p className="text-xs text-gray-600 dark:text-gray-300">{step.note}</p>
                  ) : null}
                  {step.status === "active" && typeof step.progressPercent === "number" ? (
                    <div className="mt-2 h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-1.5 bg-brand-green rounded-full transition-all"
                        style={{
                          width: `${Math.max(0, Math.min(100, step.progressPercent))}%`,
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {flow.stage === "failed" && flow.error ? (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-200">
              {flow.error}
            </div>
          ) : null}
          {flow.stage === "completed" && flow.resultNote ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/50 dark:bg-emerald-900/30 dark:text-emerald-100">
              {flow.resultNote}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
