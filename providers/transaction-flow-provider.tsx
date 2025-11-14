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
          })),
        );
      };

      return {
        activateStep: (id, note) => updateStepHelper(id, "active", note),
        completeStep: (id, note) => updateStepHelper(id, "completed", note),
        skipStep: (id, note) => updateStepHelper(id, "skipped", note),
        failStep: (id, error) => {
          guardedUpdate((prev) => {
            const next = updateStepState(prev, id, (step) => ({
              ...step,
              status: "failed",
              note: error,
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
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-holNavy/40 text-[10px] font-semibold text-holNavy/50">
        •
      </span>
    );
  }

  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-holNavy/30 text-[10px] font-semibold text-holNavy/40">
      •
    </span>
  );
}

function TransactionFlowOverlay() {
  const context = useContext(TransactionFlowContext);
  if (!context || !context.flow || !context.flow.isOpen) {
    return null;
  }

  const { flow, closeFlow } = context;

  const canDismiss = flow.stage !== "in-progress" || flow.dismissible;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 px-4 py-8"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl border border-holNavy/30 bg-[rgba(12,18,47,0.95)] p-5 shadow-2xl backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-holBlue">Transaction flow</p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{flow.title}</h2>
            {flow.subtitle ? (
              <p className="mt-1 text-sm text-[var(--text-primary)]/80">{flow.subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            className={`rounded-full border border-holBlue/50 bg-[rgba(18,24,54,0.85)] px-2 py-1 text-xs font-medium transition ${
              canDismiss
                ? "text-[var(--text-primary)] hover:border-holPurple/60 hover:text-holPurple"
                : "cursor-not-allowed text-holNavy/30"
            }`}
            onClick={() => {
              if (canDismiss) {
                closeFlow();
              }
            }}
            disabled={!canDismiss}
          >
            Close
          </button>
        </div>
        <p className="mt-3 rounded-lg border border-holBlue/30 bg-[rgba(18,24,54,0.85)] px-3 py-2 text-xs text-[var(--text-primary)]/80">
          Some steps can take a moment to finalize. If the step indicator moves or pauses on a
          transaction, check your wallet for a pending request and approve it to keep things moving.
        </p>
        <div className="mt-4 space-y-3">
          {flow.steps.map((step) => (
            <div key={step.id} className="flex items-start gap-3">
              <span className="mt-0.5">
                <StatusIcon status={step.status} />
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-[var(--text-primary)]">{step.label}</p>
                {step.note ? (
                  <p className="text-xs text-[var(--text-primary)]/75">{step.note}</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {flow.stage === "failed" && flow.error ? (
          <div className="mt-4 rounded-lg border border-rose-500/50 bg-rose-900/40 p-3 text-sm text-rose-100">
            {flow.error}
          </div>
        ) : null}
        {flow.stage === "completed" && flow.resultNote ? (
          <div className="mt-4 rounded-lg border border-emerald-400/50 bg-emerald-900/30 p-3 text-sm text-emerald-100">
            {flow.resultNote}
          </div>
        ) : null}
      </div>
    </div>
  );
}
