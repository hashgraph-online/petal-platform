"use client";

import { useMemo } from "react";
import { useWallet } from "@/providers/wallet-provider";
import { useIdentity } from "@/providers/identity-provider";
import { useToast } from "@/providers/toast-provider";

export function ConnectWalletButton() {
  const { connect, disconnect, accountId, isConnecting } = useWallet();
  const { activeIdentity } = useIdentity();
  const { pushToast } = useToast();

  const label = useMemo(() => {
    if (isConnecting) {
      return "Connecting…";
    }
    if (activeIdentity) {
      const alias = activeIdentity.alias ? ` (${activeIdentity.alias})` : "";
      return `Connected: ${activeIdentity.accountId}${alias}`;
    }
    return "Connect Wallet";
  }, [activeIdentity, isConnecting]);

  const handleClick = async () => {
    try {
      if (accountId) {
        await disconnect();
        pushToast({ title: "Disconnected", variant: "success" });
        return;
      }
      await connect();
      pushToast({ title: "Wallet connected", variant: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected wallet error";
      pushToast({ title: "Wallet connection failed", description: message, variant: "error" });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isConnecting}
      className={`rounded-full px-4 py-2 text-sm font-semibold shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
        accountId
          ? "bg-emerald-600 text-white hover:bg-emerald-500 focus-visible:outline-emerald-600"
          : "bg-violet-600 text-white hover:bg-violet-500 focus-visible:outline-violet-600"
      } ${isConnecting ? "opacity-60" : ""}`}
      title={
        accountId
          ? `Disconnect ${accountId}`
          : "Connect to a Hedera wallet"
      }
    >
      {label}
    </button>
  );
}
