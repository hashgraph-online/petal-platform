"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { PetalRecord } from "@/lib/hedera/petals";
import { readAccountData, writeAccountData, storageNamespaces } from "@/lib/storage";
import { useWallet } from "@/providers/wallet-provider";
import type { DAppSigner } from "@hashgraph/hedera-wallet-connect";

export type Identity = {
  type: "base" | "petal";
  accountId: string;
  alias?: string;
};

type IdentityContextValue = {
  activeIdentity: Identity | null;
  baseAccountId: string | null;
  petals: PetalRecord[];
  addPetal: (petal: PetalRecord) => void;
  updatePetal: (accountId: string, updates: Partial<PetalRecord>) => void;
  removePetal: (accountId: string) => void;
  activateIdentity: (accountId: string) => Promise<DAppSigner>;
};

const IdentityContext = createContext<IdentityContextValue | undefined>(undefined);

type IdentityState = {
  baseAccountId: string | null;
  activeIdentity: Identity | null;
  petals: PetalRecord[];
};

type IdentityAction =
  | { type: "reset" }
  | { type: "initialize"; baseAccountId: string; petals: PetalRecord[] }
  | { type: "setPetals"; petals: PetalRecord[] }
  | { type: "setActive"; identity: Identity | null };

const initialState: IdentityState = {
  baseAccountId: null,
  activeIdentity: null,
  petals: [],
};

function identityReducer(state: IdentityState, action: IdentityAction): IdentityState {
  switch (action.type) {
    case "reset":
      return { ...initialState };
    case "initialize":
      return {
        baseAccountId: action.baseAccountId,
        petals: action.petals,
        activeIdentity: { type: "base", accountId: action.baseAccountId },
      };
    case "setPetals":
      return { ...state, petals: action.petals };
    case "setActive":
      return { ...state, activeIdentity: action.identity };
    default:
      return state;
  }
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const {
    accountId: walletAccountId,
    selectAccount,
    availableAccounts,
    signer: walletSigner,
  } = useWallet();
  const [state, dispatch] = useReducer(identityReducer, initialState);
  const { baseAccountId, petals, activeIdentity } = state;

  const loadPetals = useCallback(
    (accountId: string) =>
      readAccountData<PetalRecord[]>(storageNamespaces.petals, accountId, []),
    [],
  );

  const persistPetals = useCallback(
    (accountId: string, data: PetalRecord[]) =>
      writeAccountData(storageNamespaces.petals, accountId, data, {
        ttlMs: 24 * 60 * 60 * 1000,
      }),
    [],
  );

  useEffect(() => {
    if (!walletAccountId) {
      dispatch({ type: "reset" });
      return;
    }

    const storedPetals = loadPetals(walletAccountId);
    dispatch({ type: "initialize", baseAccountId: walletAccountId, petals: storedPetals });
  }, [walletAccountId, loadPetals]);

  const addPetal = useCallback(
    (petal: PetalRecord) => {
      if (!baseAccountId) {
        throw new Error("Connect a wallet before registering petals");
      }
      const filtered = petals.filter((item) => item.accountId !== petal.accountId);
      const updated = [...filtered, petal];
      persistPetals(baseAccountId, updated);
      dispatch({ type: "setPetals", petals: updated });
    },
    [baseAccountId, persistPetals, petals],
  );

  const updatePetal = useCallback(
    (accountId: string, updates: Partial<PetalRecord>) => {
      if (!baseAccountId) {
        throw new Error("Connect a wallet before updating petals");
      }
      const updated = petals.map((petal) =>
        petal.accountId === accountId ? { ...petal, ...updates } : petal,
      );
      persistPetals(baseAccountId, updated);
      dispatch({ type: "setPetals", petals: updated });
    },
    [baseAccountId, persistPetals, petals],
  );

  const removePetal = useCallback(
    (accountId: string) => {
      if (!baseAccountId) {
        return;
      }
      const updated = petals.filter((petal) => petal.accountId !== accountId);
      persistPetals(baseAccountId, updated);
      dispatch({ type: "setPetals", petals: updated });
    },
    [baseAccountId, persistPetals, petals],
  );

  const activateIdentity = useCallback(
    async (accountId: string) => {
      if (!baseAccountId) {
        throw new Error("Connect a wallet to activate identities");
      }

      const normalizedAccountId = accountId.trim();
      const normalizedBaseAccountId = baseAccountId.trim();

      const isWalletManaged = availableAccounts.some(
        (value) => value.trim() === normalizedAccountId,
      );

      if (isWalletManaged) {
        const signer = await selectAccount(normalizedAccountId);

        if (normalizedAccountId === normalizedBaseAccountId) {
          dispatch({ type: "setActive", identity: { type: "base", accountId: normalizedAccountId } });
        } else {
          const petal = petals.find((item) => item.accountId === normalizedAccountId);
          dispatch({
            type: "setActive",
            identity: {
              type: "petal",
              accountId: normalizedAccountId,
              alias: petal?.alias,
            },
          });
        }

        return signer;
      }

      if (!walletSigner) {
        throw new Error(
          `Wallet does not expose a signer for derived account ${normalizedAccountId}. Reconnect to continue.`,
        );
      }

      const petal = petals.find((item) => item.accountId === normalizedAccountId);
      dispatch({
        type: "setActive",
        identity: {
          type: "petal",
          accountId: normalizedAccountId,
          alias: petal?.alias,
        },
      });

      return walletSigner;
    },
    [
      availableAccounts,
      baseAccountId,
      petals,
      selectAccount,
      walletSigner,
    ],
  );

  const value = useMemo<IdentityContextValue>(
    () => ({
      activeIdentity,
      baseAccountId,
      petals,
      addPetal,
      updatePetal,
      removePetal,
      activateIdentity,
    }),
    [
      activeIdentity,
      baseAccountId,
      petals,
      addPetal,
      updatePetal,
      removePetal,
      activateIdentity,
    ],
  );

  return (
    <IdentityContext.Provider value={value}>{children}</IdentityContext.Provider>
  );
}

export function useIdentity(): IdentityContextValue {
  const context = useContext(IdentityContext);
  if (!context) {
    throw new Error("useIdentity must be used within an IdentityProvider");
  }
  return context;
}
