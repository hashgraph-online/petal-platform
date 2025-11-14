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
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-600"
        }`}
      >
        {debugMode ? "Debug On" : "Debug"}
      </button>
      <ConnectWalletButton />
    </div>
  );
}
