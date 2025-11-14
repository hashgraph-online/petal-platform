"use client";

import type { ReactNode } from "react";
import { WalletProvider } from "@/providers/wallet-provider";
import { IdentityProvider } from "@/providers/identity-provider";
import { FloraProvider } from "@/providers/flora-provider";
import { DebugProvider } from "@/providers/debug-provider";
import { ToastProvider } from "@/providers/toast-provider";
import { TransactionFlowProvider } from "@/providers/transaction-flow-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <IdentityProvider>
        <FloraProvider>
          <DebugProvider>
            <ToastProvider>
              <TransactionFlowProvider>{children}</TransactionFlowProvider>
            </ToastProvider>
          </DebugProvider>
        </FloraProvider>
      </IdentityProvider>
    </WalletProvider>
  );
}
