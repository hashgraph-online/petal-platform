"use client";

import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { HelpModalTrigger } from "@/components/ui/HelpModal";
import { CacheToolsButton } from "@/components/debug/CacheTools";
import { useDebug } from "@/providers/debug-provider";
import { Button } from "@/components/ui/button";

export function HeaderControls() {
  const { debugMode, toggleDebug } = useDebug();

  return (
    <div className="flex items-center gap-2">
      <HelpModalTrigger />
      <CacheToolsButton />
      <Button
        type="button"
        onClick={toggleDebug}
        variant="outline"
        size="sm"
        className={`rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${
          debugMode
            ? "border-brand-green/50 bg-brand-green/15 text-brand-dark"
            : "border-brand-blue/60 bg-background text-foreground hover:border-brand-purple/60 hover:text-brand-purple"
        }`}
      >
        {debugMode ? "Debug On" : "Debug"}
      </Button>
      <ConnectWalletButton />
    </div>
  );
}
