import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import type { PetalRecord } from "@/lib/hedera/petals";

const walletModule = vi.hoisted(() => ({
  selectAccount: vi.fn(async (accountId: string) => ({ accountId })),
  accountId: "0.0.1001",
  signer: { accountId: "0.0.1001", type: "base" },
  availableAccounts: ["0.0.1001"],
}));

vi.mock("@/providers/wallet-provider", () => ({
  useWallet: () => ({
    accountId: walletModule.accountId,
    signer: walletModule.signer,
    selectAccount: walletModule.selectAccount,
    availableAccounts: walletModule.availableAccounts,
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

import { IdentityProvider, useIdentity } from "@/providers/identity-provider";

function IdentityConsumer({ onReady }: { onReady: (value: ReturnType<typeof useIdentity>) => void }) {
  const identity = useIdentity();
  onReady(identity);
  return null;
}

describe("IdentityProvider", () => {
  beforeEach(() => {
    walletModule.selectAccount.mockClear();
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

    let latestIdentity: ReturnType<typeof useIdentity> | null = null;
    const handleReady = (value: ReturnType<typeof useIdentity>) => {
      latestIdentity = value;
    };

    render(
      <IdentityProvider>
        <IdentityConsumer onReady={handleReady} />
      </IdentityProvider>,
    );

    await waitFor(() => {
      expect(latestIdentity?.activeIdentity?.accountId).toBe("0.0.1001");
      expect(latestIdentity?.petals).toHaveLength(1);
    });

    let signer: unknown;
    await act(async () => {
      signer = await latestIdentity!.activateIdentity("0.0.2001");
    });

    expect(walletModule.selectAccount).not.toHaveBeenCalledWith("0.0.2001");
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

    let ctx: ReturnType<typeof useIdentity> | null = null;
    render(
      <IdentityProvider>
        <IdentityConsumer onReady={(value) => {
          ctx = value;
        }} />
      </IdentityProvider>,
    );

    await waitFor(() => expect(ctx).not.toBeNull());

    const petal: PetalRecord = {
      accountId: "0.0.3001",
      alias: "new",
      createdAt: new Date().toISOString(),
    };

    await act(async () => {
      ctx!.addPetal(petal);
    });

    expect(storageModule.writeAccountData).toHaveBeenCalledWith(
      "petals",
      "0.0.1001",
      expect.arrayContaining([expect.objectContaining({ accountId: "0.0.3001" })]),
      { ttlMs: 24 * 60 * 60 * 1000 },
    );
  });

  it("re-selects base account identities via the wallet connector", async () => {
    storageModule.readAccountData.mockReturnValue([]);

    const returnedSigner = { accountId: "0.0.1001", source: "connector" };
    walletModule.selectAccount.mockResolvedValueOnce(returnedSigner);

    let latestIdentity: ReturnType<typeof useIdentity> | null = null;
    render(
      <IdentityProvider>
        <IdentityConsumer onReady={(value) => {
          latestIdentity = value;
        }} />
      </IdentityProvider>,
    );

    await waitFor(() => {
      expect(latestIdentity?.activeIdentity?.accountId).toBe("0.0.1001");
    });

    let signer: unknown;
    await act(async () => {
      signer = await latestIdentity!.activateIdentity("0.0.1001");
    });

    expect(walletModule.selectAccount).toHaveBeenCalledWith("0.0.1001");
    expect(signer).toBe(returnedSigner);
  });
});
