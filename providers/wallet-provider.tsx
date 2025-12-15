'use client';

import { LedgerId } from '@hashgraph/sdk';
import type { HashinalsWalletConnectSDK } from '@hashgraphonline/hashinal-wc';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { appUrl, env, walletConnectProjectId } from '@/config/env';
import { ensureHcs2RegistryTopics } from '@/lib/hedera/hcs2-topic-bootstrap';

type Network = 'mainnet' | 'testnet';

export type WalletContextType = {
  sdk: HashinalsWalletConnectSDK | null;
  isConnected: boolean;
  isLoading: boolean;
  topicsReady: boolean;
  topicsLoading: boolean;
  topicsError?: string;
  accountId?: string;
  network: Network;
  connect: () => Promise<string | undefined>;
  disconnect: () => Promise<void>;
  setNetwork: (n: Network) => void;
};

export const WalletContext = createContext<WalletContextType | null>(null);

const PROJECT_ID =
  process.env.NEXT_PUBLIC_WC_PROJECT_ID || walletConnectProjectId || '';

const initializedSdkKeys = new Set<string>();

function normalizeNetwork(value: string): Network {
  return value === 'mainnet' ? 'mainnet' : 'testnet';
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [resolvedAppUrl, setResolvedAppUrl] = useState(() => {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    return appUrl ?? 'http://localhost:3000';
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [topicsReady, setTopicsReady] = useState(false);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [topicsError, setTopicsError] = useState<string | undefined>();
  const [sdk, setSDK] = useState<HashinalsWalletConnectSDK | null>(null);
  const [network, setNetwork] = useState<Network>(
    normalizeNetwork(
      process.env.NEXT_PUBLIC_NETWORK ?? env.HEDERA_NETWORK,
    ),
  );
  const [accountId, setAccountId] = useState<string | undefined>();
  const bootstrappedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const currentOrigin = window.location.origin;
    if (currentOrigin && currentOrigin !== resolvedAppUrl) {
      setResolvedAppUrl(currentOrigin);
    }
  }, [resolvedAppUrl]);

  const getLedgerId = useCallback((target: Network) => {
    return target === 'mainnet' ? LedgerId.MAINNET : LedgerId.TESTNET;
  }, []);

  const projectMetadata = useMemo(
    () => ({
      name: process.env.NEXT_PUBLIC_APP_NAME || 'HOL Petal Platform',
      description:
        process.env.NEXT_PUBLIC_APP_DESCRIPTION ||
        'HOL-built Hedera dApp for profiles, petals, and messaging.',
      url: resolvedAppUrl,
      icons: [
        process.env.NEXT_PUBLIC_APP_ICON ||
          'https://raw.githubusercontent.com/hashgraph/hedera-brand-assets/main/icons/safari-pinned-tab.svg',
      ],
    }),
    [resolvedAppUrl],
  );

  const ensureSdkInstance = useCallback(
    async (targetNetwork: Network) => {
      const { HashinalsWalletConnectSDK } = await import(
        '@hashgraphonline/hashinal-wc'
      );
      const ledger = getLedgerId(targetNetwork);
      const instance = HashinalsWalletConnectSDK.getInstance(undefined, ledger);
      if (!instance) {
        setSDK(null);
        setIsConnected(false);
        setAccountId(undefined);
        return null;
      }
      instance.setNetwork(ledger);
      try {
        const initKey = `${targetNetwork}:${PROJECT_ID}`;
        if (!initializedSdkKeys.has(initKey)) {
          await instance.init(PROJECT_ID, projectMetadata, ledger);
          initializedSdkKeys.add(initKey);
        }
        const acct = await instance.initAccount(PROJECT_ID, projectMetadata, ledger);
        if (acct?.accountId) {
          setIsConnected(true);
          setAccountId(acct.accountId);
        } else {
          setIsConnected(false);
          setAccountId(undefined);
        }
      } catch {
        setIsConnected(false);
        setAccountId(undefined);
      }
      setSDK(instance);
      return instance;
    },
    [getLedgerId, projectMetadata],
  );

  useEffect(() => {
    void ensureSdkInstance(network);
  }, [network, ensureSdkInstance]);

  const bootstrapTopics = useCallback(
    async (instance: HashinalsWalletConnectSDK, connectedAccountId: string) => {
      const key = `${network}:${connectedAccountId}`;
      if (bootstrappedForRef.current === key && topicsReady) {
        return;
      }

      setTopicsLoading(true);
      setTopicsError(undefined);
      try {
        await ensureHcs2RegistryTopics({ hwc: instance, network });
        setTopicsReady(true);
        bootstrappedForRef.current = key;
      } catch (error) {
        setTopicsReady(false);
        bootstrappedForRef.current = null;
        const message = error instanceof Error ? error.message : 'Failed to initialize registry topics';
        setTopicsError(message);
      } finally {
        setTopicsLoading(false);
      }
    },
    [network, topicsReady],
  );

  useEffect(() => {
    if (!sdk || !isConnected || !accountId) {
      setTopicsReady(false);
      setTopicsLoading(false);
      setTopicsError(undefined);
      bootstrappedForRef.current = null;
      return;
    }

    void bootstrapTopics(sdk, accountId);
  }, [sdk, isConnected, accountId, bootstrapTopics]);

  const connect = useCallback(async () => {
    setIsLoading(true);
    try {
      const instance = sdk ?? (await ensureSdkInstance(network));
      if (!instance) return undefined;
      const ledger = getLedgerId(network);
      if (!ledger) return undefined;
      const response = await instance.connectWallet(PROJECT_ID, projectMetadata, ledger);
      const nextAccountId = response?.accountId;
      if (!nextAccountId) {
        setIsConnected(false);
        setAccountId(undefined);
        return undefined;
      }
      setIsConnected(true);
      setAccountId(nextAccountId);
      void bootstrapTopics(instance, nextAccountId);
      return nextAccountId;
    } catch (error) {
      setIsConnected(false);
      setAccountId(undefined);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [sdk, ensureSdkInstance, network, getLedgerId, projectMetadata, bootstrapTopics]);

  const disconnect = useCallback(async () => {
    setIsLoading(true);
    try {
      if (sdk) {
        try {
          await sdk.disconnectWallet(true);
        } catch {}
      }
    } finally {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('connectedAccountId');
        window.localStorage.removeItem('connectedNetwork');
      }
      setIsConnected(false);
      setAccountId(undefined);
      setTopicsReady(false);
      setTopicsLoading(false);
      setTopicsError(undefined);
      bootstrappedForRef.current = null;
      setIsLoading(false);
    }
  }, [sdk]);

  const value = useMemo<WalletContextType>(
    () => ({
      sdk,
      isConnected,
      isLoading,
      topicsReady,
      topicsLoading,
      topicsError,
      accountId,
      network,
      connect,
      disconnect,
      setNetwork,
    }),
    [
      sdk,
      isConnected,
      isLoading,
      topicsReady,
      topicsLoading,
      topicsError,
      accountId,
      network,
      connect,
      disconnect,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextType {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
