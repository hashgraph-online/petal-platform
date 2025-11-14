"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { DAppConnector, DAppSigner } from "@hashgraph/hedera-wallet-connect";
import { AccountId } from "@hashgraph/sdk";
import { getWalletConnector, resetWalletConnector } from "@/lib/hedera/wallet";

const SESSION_STORAGE_KEY = "petal-wallet-session";

export type WalletContextValue = {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signer: DAppSigner | null;
  accountId: string | null;
  availableAccounts: string[];
  selectAccount: (accountId: string) => Promise<DAppSigner>;
  isConnecting: boolean;
};

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

function normalizeAccount(account: string): string {
  const segments = account.split(":");
  return segments.length >= 3 ? segments[2] : account;
}

function extractAccounts(namespaces: Record<string, { accounts: string[] }> | undefined) {
  if (!namespaces) {
    return [] as string[];
  }
  const accounts: string[] = [];
  for (const namespace of Object.values(namespaces)) {
    if (!namespace.accounts) {
      continue;
    }
    for (const account of namespace.accounts) {
      accounts.push(normalizeAccount(account));
    }
  }
  return Array.from(new Set(accounts));
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [connector, setConnector] = useState<DAppConnector | null>(null);
  const [signer, setSigner] = useState<DAppSigner | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [availableAccounts, setAvailableAccounts] = useState<string[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapConnection() {
      try {
        const instance = await getWalletConnector();
        if (cancelled) {
          return;
        }
        setConnector(instance);
        const existingSigners = instance.signers ?? [];
        if (existingSigners.length === 0) {
          return;
        }
        const accounts = existingSigners.map((item) => item.getAccountId().toString());
        setAvailableAccounts(accounts);
        const storedAccountId =
          typeof window !== "undefined"
            ? window.localStorage.getItem(SESSION_STORAGE_KEY)
            : null;
        const targetAccountId = storedAccountId && accounts.includes(storedAccountId)
          ? storedAccountId
          : accounts[0];
        if (targetAccountId) {
          const normalized = AccountId.fromString(targetAccountId);
          try {
            const signerForAccount = instance.getSigner(normalized);
            setSigner(signerForAccount);
            setAccountId(normalized.toString());
          } catch (error) {
            console.warn("Failed to restore wallet signer", error);
          }
        }
      } catch (error) {
        console.warn("Unable to bootstrap wallet connector", error);
      }
    }

    void bootstrapConnection();

    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    try {
      const instance = connector ?? (await getWalletConnector());
      setConnector(instance);

      const session = await instance.openModal();
      const accounts = extractAccounts(session.namespaces);
      if (accounts.length === 0) {
        throw new Error("Wallet did not provide an account");
      }

      const account = AccountId.fromString(accounts[0]);
      const sessionSigner = instance.getSigner(account);

      setSigner(sessionSigner);
      const normalizedAccounts = accounts.map((value) => AccountId.fromString(value).toString());
      setAccountId(account.toString());
      setAvailableAccounts(normalizedAccounts);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SESSION_STORAGE_KEY, account.toString());
      }
    } finally {
      setIsConnecting(false);
    }
  }, [connector]);

  const disconnect = useCallback(async () => {
    try {
      await connector?.disconnectAll();
    } finally {
      resetWalletConnector();
      setConnector(null);
      setSigner(null);
      setAccountId(null);
      setAvailableAccounts([]);
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }
  }, [connector]);

  const selectAccount = useCallback(
    async (targetAccountId: string) => {
      if (!connector) {
        throw new Error("Connect a wallet before selecting accounts");
      }

      const normalized = AccountId.fromString(targetAccountId);

      try {
        const signerForAccount = connector.getSigner(normalized);
        setSigner(signerForAccount);
        setAccountId(normalized.toString());
        if (!availableAccounts.includes(normalized.toString())) {
          setAvailableAccounts((prev) => [...prev, normalized.toString()]);
        }
        if (typeof window !== "undefined") {
          window.localStorage.setItem(SESSION_STORAGE_KEY, normalized.toString());
        }
        return signerForAccount;
      } catch (error) {
        console.error("Failed to select wallet account", error);
        throw new Error(`Wallet cannot sign for ${normalized.toString()}`);
      }
    },
    [connector, availableAccounts],
  );

  const value = useMemo<WalletContextValue>(
    () => ({ connect, disconnect, signer, accountId, availableAccounts, selectAccount, isConnecting }),
    [connect, disconnect, signer, accountId, availableAccounts, selectAccount, isConnecting],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
