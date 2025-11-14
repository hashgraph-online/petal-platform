"use client";

import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { HelpModalTrigger } from "@/components/ui/HelpModal";
import { CacheToolsButton } from "@/components/debug/CacheTools";
import { useDebug } from "@/providers/debug-provider";

export function HeaderControls() {
  const { debugMode, toggleDebug } = useDebug();

  return (
    <div className="flex items-center gap-2">
      <HelpModalTrigger />
      <CacheToolsButton />
      <button
        type="button"
        onClick={toggleDebug}
        className={`rounded-full border px-3 py-1 text-xs font-semibold shadow-sm transition ${
          debugMode
            ? "border-holGreen/50 bg-holGreen/15 text-holNavy"
            : "border-holBlue/60 bg-[rgba(18,24,54,0.85)] text-[var(--text-primary)] hover:border-holPurple/60 hover:text-holPurple"
        }`}
      >
        {debugMode ? "Debug On" : "Debug"}
      </button>
      <ConnectWalletButton />
    </div>
  );
}
