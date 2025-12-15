import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import type { PetalRecord } from "@/lib/hedera/petals";

const walletModule = vi.hoisted(() => ({
  accountId: "0.0.1001",
  signer: { accountId: "0.0.1001", type: "base" },
  sdk: {
    dAppConnector: {
      getSigner: vi.fn(() => walletModule.signer),
    },
  },
}));

vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () => ({
    accountId: walletModule.accountId,
    sdk: walletModule.sdk,
  }),
}));

const storageModule = vi.hoisted(() => ({
  readAccountData: vi.fn(),
  writeAccountData: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  readAccountData: storageModule.readAccountData,
  writeAccountData: storageModule.writeAccountData,
  storageNamespaces: { petals: "petals" },
}));

import { IdentityProvider, useIdentity } from "../identity-provider";

type IdentityContextValue = {
  activeIdentity: { type: "base" | "petal"; accountId: string; alias?: string } | null;
  baseAccountId: string | null;
  petals: PetalRecord[];
  addPetal: (petal: PetalRecord) => void;
  updatePetal: (accountId: string, updates: Partial<PetalRecord>) => void;
  removePetal: (accountId: string) => void;
  activateIdentity: (accountId: string) => Promise<unknown>;
};

function IdentityConsumer({
  onReady,
}: {
  onReady: (value: IdentityContextValue) => void;
}) {
  const identity = useIdentity();
  onReady(identity);
  return null;
}

describe("IdentityProvider", () => {
  beforeEach(() => {
    walletModule.sdk.dAppConnector.getSigner.mockClear();
    storageModule.readAccountData.mockReset();
    storageModule.writeAccountData.mockReset();
  });

  it("initialises from storage and switches identities", async () => {
    storageModule.readAccountData.mockReturnValue([
      {
        accountId: "0.0.2001",
        alias: "petal-a",
      },
    ]);

    let latestIdentity!: IdentityContextValue;
    const handleReady = (value: IdentityContextValue) => {
      latestIdentity = value;
    };

    render(
      <IdentityProvider>
        <IdentityConsumer onReady={handleReady} />
      </IdentityProvider>,
    );

    await waitFor(() => {
      expect(latestIdentity.activeIdentity?.accountId).toBe("0.0.1001");
      expect(latestIdentity.petals).toHaveLength(1);
    });

    let signer: unknown;
    await act(async () => {
      signer = await latestIdentity!.activateIdentity("0.0.2001");
    });

    expect(signer).toBe(walletModule.signer);

    await waitFor(() => {
      expect(latestIdentity?.activeIdentity).toMatchObject({
        type: "petal",
        accountId: "0.0.2001",
        alias: "petal-a",
      });
    });
  });

  it("persists petal updates via writeAccountData", async () => {
    storageModule.readAccountData.mockReturnValue([]);

    let ctx!: IdentityContextValue;
    render(
      <IdentityProvider>
        <IdentityConsumer onReady={(value) => {
          ctx = value;
        }} />
      </IdentityProvider>,
    );

    await waitFor(() => expect(ctx).toBeDefined());

    const petal: PetalRecord = {
      accountId: "0.0.3001",
      alias: "new",
      createdAt: new Date().toISOString(),
    };

    await act(async () => {
      ctx.addPetal(petal);
    });

    expect(storageModule.writeAccountData).toHaveBeenCalledWith(
      "petals",
      "0.0.1001",
      expect.arrayContaining([expect.objectContaining({ accountId: "0.0.3001" })]),
      { ttlMs: 24 * 60 * 60 * 1000 },
    );
  });

  it("keeps base identity active when requested", async () => {
    storageModule.readAccountData.mockReturnValue([]);

    let latestIdentity!: IdentityContextValue;
    render(
      <IdentityProvider>
        <IdentityConsumer onReady={(value) => {
          latestIdentity = value;
        }} />
      </IdentityProvider>,
    );

    await waitFor(() => {
      expect(latestIdentity.activeIdentity?.accountId).toBe("0.0.1001");
    });

    let signer: unknown;
    await act(async () => {
      signer = await latestIdentity.activateIdentity("0.0.1001");
    });

    expect(signer).toBe(walletModule.signer);
    expect(latestIdentity.activeIdentity).toMatchObject({
      type: "base",
      accountId: "0.0.1001",
    });
  });
});
