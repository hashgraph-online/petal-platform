"use client";

import { useCallback, useMemo } from "react";
import { useWallet } from "@/providers/wallet-provider";
import { useIdentity } from "@/providers/identity-provider";
import { useToast } from "@/providers/toast-provider";
import { Button } from "@/components/ui/button";

type ConnectWalletButtonVariant = "primary" | "navbar";

type ConnectWalletButtonProps = {
  variant?: ConnectWalletButtonVariant;
  onActionComplete?: () => void;
};

function formatNavbarLabel(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 18) return trimmed;
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-6)}`;
}

export function ConnectWalletButton({
  variant = "primary",
  onActionComplete,
}: ConnectWalletButtonProps) {
  const { connect, disconnect, accountId, isLoading, isConnected } = useWallet();
  const { activeIdentity } = useIdentity();
  const { pushToast } = useToast();

  const label = useMemo(() => {
    if (isLoading) {
      return "Connecting…";
    }
    if (activeIdentity) {
      if (variant === "navbar") {
        const display = activeIdentity.alias ?? activeIdentity.accountId;
        return formatNavbarLabel(display);
      }
      const alias = activeIdentity.alias ? ` (${activeIdentity.alias})` : "";
      return `Connected: ${activeIdentity.accountId}${alias}`;
    }
    return "Connect Wallet";
  }, [activeIdentity, isLoading, variant]);

  const handleClick = useCallback(async () => {
    try {
      if (isConnected) {
        await disconnect();
        pushToast({ title: "Disconnected", variant: "success" });
        onActionComplete?.();
        return;
      }
      await connect();
      pushToast({ title: "Wallet connected", variant: "success" });
      onActionComplete?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected wallet error";
      pushToast({ title: "Wallet connection failed", description: message, variant: "error" });
    }
  }, [connect, disconnect, isConnected, pushToast, onActionComplete]);

  if (variant === "navbar") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className={`flex items-center px-3 py-1.5 rounded-md text-white/95 font-mono font-medium text-[15px] no-underline hover:no-underline transition-all duration-200 hover:text-white hover:bg-white/10 focus:outline-none outline-none border-none cursor-pointer bg-transparent ${
          isLoading ? "opacity-60 cursor-not-allowed" : ""
        }`}
        title={accountId ? `Disconnect ${accountId}` : "Connect to a Hedera wallet"}
      >
        {label}
      </button>
    );
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      className={`rounded-full border px-4 py-2 text-sm font-semibold shadow-sm ${
        accountId
          ? "border-brand-green/50 bg-brand-green text-white hover:bg-brand-green/90 focus-visible:outline-brand-green"
          : "border-brand-blue/50 bg-brand-blue text-white hover:bg-brand-purple focus-visible:outline-brand-blue"
      } ${isLoading ? "opacity-60" : ""}`}
      title={
        accountId
          ? `Disconnect ${accountId}`
          : "Connect to a Hedera wallet"
      }
    >
      {label}
    </Button>
  );
}
