import type { AccountId, Signer } from "@hashgraph/sdk";
import type { DAppSigner as HederaWalletConnectSigner } from "@hashgraph/hedera-wallet-connect";

export type DAppSigner = Signer;

export type DAppConnector = {
  getSigner: (accountId: AccountId) => DAppSigner;
  signers?: DAppSigner[];
};

export function requireWalletConnectSigner(
  signer: DAppSigner,
  errorMessage: string,
): HederaWalletConnectSigner {
  const candidate = signer as {
    signTransaction?: unknown;
    getAccountId?: unknown;
  };
  if (
    typeof candidate.signTransaction !== "function" ||
    typeof candidate.getAccountId !== "function"
  ) {
    throw new Error(errorMessage);
  }
  return signer as HederaWalletConnectSigner;
}
