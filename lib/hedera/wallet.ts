"use client";

import type { HashinalsWalletConnectSDK } from "@hashgraphonline/hashinal-wc";
import { LedgerId } from "@hashgraph/sdk";
import { appUrl, env, isDebug, walletConnectProjectId } from "@/config/env";

let sdkInstance: HashinalsWalletConnectSDK | null = null;

function resolveMetadataUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  if (appUrl) {
    return appUrl;
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

export function getWalletLedgerId(): LedgerId {
  return resolveLedgerId();
}

export function getWalletMetadata() {
  return buildMetadata();
}

export async function getWalletSdk(): Promise<HashinalsWalletConnectSDK> {
  const { HashinalsWalletConnectSDK } = await import(
    "@hashgraphonline/hashinal-wc"
  );
  const ledger = resolveLedgerId();
  if (!sdkInstance) {
    sdkInstance = HashinalsWalletConnectSDK.getInstance(undefined, ledger);
  }
  sdkInstance.setNetwork(ledger);
  if (isDebug) {
    sdkInstance.setLogLevel("debug");
  }
  return sdkInstance;
}

export async function initWalletSdk(): Promise<HashinalsWalletConnectSDK> {
  const instance = await getWalletSdk();
  const ledger = resolveLedgerId();
  await instance.init(walletConnectProjectId, buildMetadata(), ledger);
  return instance;
}

export function resetWalletSdk(): void {
  sdkInstance = null;
}
