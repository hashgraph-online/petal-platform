"use client";

import type {
  DAppConnector,
  HederaJsonRpcMethod,
  HederaSessionEvent,
} from "@hashgraph/hedera-wallet-connect";
import { LedgerId } from "@hashgraph/sdk";
import { appUrl, env, isDebug, walletConnectProjectId } from "@/config/env";

let connector: DAppConnector | null = null;

function resolveMetadataUrl(): string {
  if (appUrl) {
    return appUrl;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "https://petal-platform.local";
}

function buildMetadata() {
  const url = resolveMetadataUrl();
  const favicon = `${url.replace(/\/$/, "")}/favicon.ico`;

  return {
    name: "Petal Platform",
    description:
      "Wallet connection for Hedera profiles, petals, messaging, and floras.",
    url,
    icons: [favicon],
  };
}

function resolveLedgerId(): LedgerId {
  switch (env.HEDERA_NETWORK) {
    case "mainnet":
      return LedgerId.MAINNET;
    case "previewnet":
      return LedgerId.PREVIEWNET;
    case "testnet":
    default:
      return LedgerId.TESTNET;
  }
}

export async function getWalletConnector(): Promise<DAppConnector> {
  if (connector) {
    return connector;
  }

  if (isDebug) {
    console.debug("WalletConnect project ID", walletConnectProjectId);
  }

  const { DAppConnector, HederaJsonRpcMethod, HederaSessionEvent } = await import(
    "@hashgraph/hedera-wallet-connect"
  );

  const supportedEvents = [
    HederaSessionEvent.ChainChanged,
    HederaSessionEvent.AccountsChanged,
  ];

  const instance = new DAppConnector(
    buildMetadata(),
    resolveLedgerId(),
    walletConnectProjectId,
    Object.values(HederaJsonRpcMethod),
    supportedEvents,
  );

  await instance.init({ logger: isDebug ? "info" : "error" });
  connector = instance;
  return instance;
}

export function resetWalletConnector(): void {
  connector = null;
}
