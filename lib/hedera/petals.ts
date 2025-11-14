import {
  AccountCreateTransaction,
  AccountId,
  AccountUpdateTransaction,
  Hbar,
  PublicKey,
  TransactionId,
} from "@hashgraph/sdk";
import type { DAppSigner } from "@hashgraph/hedera-wallet-connect";
import {
  HCS15BrowserClient,
  type NetworkType,
} from "@hashgraphonline/standards-sdk";
import { env } from "@/config/env";
import { lookupAccount } from "@/lib/hedera/mirror";
import { fetchLatestProfileForAccount } from "@/lib/hedera/registry";

export type PetalRecord = {
  accountId: string;
  alias?: string;
  displayName?: string;
  memo?: string;
  balanceHbar?: number;
  verified?: boolean;
  createdAt: string;
  inboundTopicId?: string;
  hasProfile?: boolean;
  profileReference?: string;
  profileTopicId?: string;
  outboundTopicId?: string;
};

type CreatePetalAccountInput = {
  signer: DAppSigner;
  baseAccountId: string;
  basePublicKey: string;
  alias: string;
  initialBalance?: number;
  maxAutomaticTokenAssociations?: number;
};

type UpdatePetalMemoInput = {
  signer: DAppSigner;
  accountId: string;
  memo: string;
};

function getHcs15Client(signer?: DAppSigner): HCS15BrowserClient {
  return new HCS15BrowserClient({
    network: env.HEDERA_NETWORK as NetworkType,
    mirrorNodeUrl: env.NEXT_PUBLIC_MIRROR_NODE_URL,
    signer,
  });
}

const DEFAULT_NODE_ACCOUNT_IDS: Record<string, readonly string[]> = {
  mainnet: ["0.0.3"],
  testnet: ["0.0.3"],
  previewnet: ["0.0.3"],
};

function resolveNodeAccountIds(): AccountId[] {
  const nodeIds =
    DEFAULT_NODE_ACCOUNT_IDS[env.HEDERA_NETWORK] ?? DEFAULT_NODE_ACCOUNT_IDS.testnet;
  return nodeIds.map((nodeId) => AccountId.fromString(nodeId));
}

export async function createPetalAccount({
  signer,
  baseAccountId,
  basePublicKey,
  alias,
  initialBalance = 1,
  maxAutomaticTokenAssociations,
}: CreatePetalAccountInput): Promise<string> {
  const publicKey = PublicKey.fromString(basePublicKey);

  const transaction = new AccountCreateTransaction()
    .setKey(publicKey)
    .setInitialBalance(new Hbar(initialBalance))
    .setAccountMemo(buildPetalMemo(alias))
    .setTransactionId(TransactionId.generate(AccountId.fromString(baseAccountId)))
    .setNodeAccountIds(resolveNodeAccountIds());

  if (typeof maxAutomaticTokenAssociations === "number") {
    transaction.setMaxAutomaticTokenAssociations(maxAutomaticTokenAssociations);
  }

  await transaction.freeze();

  const response = await transaction.executeWithSigner(signer);
  const receipt = await response.getReceiptWithSigner(signer);
  const accountId = receipt?.accountId?.toString();

  if (!accountId) {
    throw new Error("Petal account creation did not return an accountId");
  }

  await verifyPetalAccount(accountId, baseAccountId).catch(() => undefined);

  return accountId;
}

export async function updatePetalMemo({
  signer,
  accountId,
  memo,
}: UpdatePetalMemoInput): Promise<void> {
  const transaction = new AccountUpdateTransaction()
    .setAccountId(AccountId.fromString(accountId))
    .setAccountMemo(memo)
    .setTransactionId(TransactionId.generate(AccountId.fromString(accountId)))
    .setNodeAccountIds(resolveNodeAccountIds());

  await transaction.freeze();

  const response = await transaction.executeWithSigner(signer);
  await response.getReceiptWithSigner(signer);
}

export async function verifyPetalAccount(
  petalAccountId: string,
  baseAccountId: string,
): Promise<boolean> {
  const client = getHcs15Client();
  return client.verifyPetalAccount(petalAccountId, baseAccountId);
}

export async function fetchPetalRecord(
  accountId: string,
  baseAccountId: string,
  alias?: string,
): Promise<PetalRecord> {
  const account = await lookupAccount(accountId);
  const memo = account?.memo;
  const balanceTinybar = account?.balance?.balance ?? 0;
  const balanceHbar = balanceTinybar / 100_000_000;
  const verified = await verifyPetalAccount(accountId, baseAccountId).catch(() => false);
  const profile = await fetchLatestProfileForAccount(accountId).catch(() => null);

  return {
    accountId,
    alias,
    displayName: profile?.displayName,
    memo,
    balanceHbar,
    verified,
    createdAt: new Date().toISOString(),
    inboundTopicId: profile?.inboundTopicId,
    hasProfile: Boolean(profile?.profileReference),
    profileReference: profile?.profileReference,
    profileTopicId: profile?.profileTopicId,
    outboundTopicId: profile?.outboundTopicId,
  };
}

function buildPetalMemo(alias: string): string {
  const memo = `Petal:${alias}`;
  return memo.length > 100 ? memo.slice(0, 100) : memo;
}
