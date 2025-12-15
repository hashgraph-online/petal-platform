"use client";

import { useMemo, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";

type AuthRequiredProps = {
  enabled: boolean;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function AuthRequired({
  enabled,
  title = "Wallet required",
  description = "Connect your wallet to continue.",
  children,
  className,
}: AuthRequiredProps) {
  const contentClassName = useMemo(() => {
    if (enabled) {
      return className;
    }
    return [
      className,
      "pointer-events-none select-none opacity-60 blur-[1px]",
    ]
      .filter(Boolean)
      .join(" ");
  }, [enabled, className]);

  return (
    <div className="relative">
      <div className={contentClassName}>{children}</div>
      {!enabled ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
            <Card className="w-full max-w-md border-border bg-card/90 p-6 text-center shadow-xl ring-1 ring-border/40">
              <div className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
              <span className="text-foreground/60">{"//"}</span>{" "}
              AUTHENTICATION_REQUIRED
              </div>
            <h3 className="mt-6 text-2xl font-bold text-foreground bg-gradient-to-r from-brand-blue via-brand-purple to-brand-green bg-clip-text text-transparent">
              {title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
            <div className="mt-6 flex justify-center">
              <ConnectWalletButton />
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
