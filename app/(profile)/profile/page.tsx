"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FormShell } from "@/components/forms/form-shell";
import { ProfileForm, type ProfileFormValues } from "@/components/profile/ProfileForm";
import { TopicMessageList } from "@/components/topics/topic-message-list";
import { topicExplorerUrl, tryGetTopicId } from "@/config/topics";
import { env, isDebug } from "@/config/env";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  createOrUpdateProfile,
  extractProfileReferenceFromMemo,
  loadProfileDocument,
  type LoadedProfileDocument,
  type ProfilePublishingEvent,
  type ProfilePublishingStep,
} from "@/lib/hedera/profile";
import { lookupAccount } from "@/lib/hedera/mirror";
import { readAccountData, removeAccountData, writeAccountData, storageNamespaces } from "@/lib/storage";
import { useWallet } from "@/providers/wallet-provider";
import { useIdentity } from "@/providers/identity-provider";
import { useTransactionFlow } from "@/providers/transaction-flow-provider";
import { getLogger } from "@/lib/logger";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { AuthRequired } from "@/components/auth/auth-required";
import { AccountId } from "@hashgraph/sdk";
import { HCS11Client } from "@hashgraphonline/standards-sdk";
import { getDraftFromHcs11Profile } from "@/lib/hedera/hcs-11-profile";

type ActivityEntry = {
  id: string;
  author: string;
  content: ReactNode;
  timestamp: string;
};

const PLACEHOLDER_TIMESTAMP = "Pending";

const initialActivity: ActivityEntry[] = [
  {
    id: "registry-placeholder",
    author: "Registry",
    content: "Profile updates will appear here once published.",
    timestamp: PLACEHOLDER_TIMESTAMP,
  },
];

const emptyProfile: ProfileFormValues = {
  alias: "",
  displayName: "",
  avatarUrl: "",
  bio: "",
};

type StoredProfile = ProfileFormValues & {
  inboundTopicId?: string;
  outboundTopicId?: string;
  accountMemo?: string;
  accountMemoVerified?: boolean;
  profileTopicId?: string;
  profileReference?: string;
};

export default function ProfilePage() {
  const logger = getLogger("profile-page");
  const {
    sdk,
    accountId: walletAccountId,
    network: walletNetwork,
    topicsReady,
    topicsLoading: topicsBootstrapping,
    topicsError: topicsBootstrapError,
  } = useWallet();
  const signer = useMemo(() => {
    if (!sdk || !walletAccountId) {
      return null;
    }
    try {
      return sdk.dAppConnector.getSigner(AccountId.fromString(walletAccountId));
    } catch {
      return null;
    }
  }, [sdk, walletAccountId]);
  const { activeIdentity } = useIdentity();
  const { startFlow } = useTransactionFlow();
  const accountId = activeIdentity?.accountId ?? walletAccountId ?? null;
  const [activity, setActivity] = useState<ActivityEntry[]>(initialActivity);
  const [lastInboundTopicId, setLastInboundTopicId] = useState<string | undefined>();
  const [lastOutboundTopicId, setLastOutboundTopicId] = useState<string | undefined>();
  const [lastProfileTopicId, setLastProfileTopicId] = useState<string | undefined>();
  const [formDefaults, setFormDefaults] = useState<ProfileFormValues>(emptyProfile);
  const [storedProfile, setStoredProfile] = useState<StoredProfile | null>(null);
  const [accountMemo, setAccountMemo] = useState<string | undefined>();
  const [profileDocument, setProfileDocument] = useState<LoadedProfileDocument | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const prefillAttemptKeyRef = useRef<string | null>(null);
  const prefillInFlightKeyRef = useRef<string | null>(null);

  const isFormEmpty = useCallback((values: ProfileFormValues) => {
    const hasAnyValue =
      values.alias.trim().length > 0 ||
      values.displayName.trim().length > 0 ||
      (values.avatarUrl?.trim().length ?? 0) > 0 ||
      (values.bio?.trim().length ?? 0) > 0;
    return !hasAnyValue;
  }, []);

  useEffect(() => {
    if (!accountId) {
      setFormDefaults(emptyProfile);
      setLastInboundTopicId(undefined);
      setLastOutboundTopicId(undefined);
      setLastProfileTopicId(undefined);
      setActivity(initialActivity);
      setStoredProfile(null);
      setAccountMemo(undefined);
      setProfileDocument(null);
      setViewError(null);
      setViewLoading(false);
      return;
    }

    const stored = readAccountData<StoredProfile | null>(
      storageNamespaces.profile,
      accountId,
      null,
    );

    if (stored) {
      setStoredProfile(stored);
      setFormDefaults({
        alias: stored.alias ?? "",
        displayName: stored.displayName ?? "",
        avatarUrl: stored.avatarUrl ?? "",
        bio: stored.bio ?? "",
      });
      setLastInboundTopicId(stored.inboundTopicId);
      setLastOutboundTopicId(stored.outboundTopicId);
      setLastProfileTopicId(stored.profileTopicId);
      setAccountMemo(stored.accountMemo);
      const profileActivity: ActivityEntry = {
        id: `stored-${accountId}`,
        author: "Profile",
        content: stored.profileReference ? (
          <div className="space-y-1">
            <p>Cached profile reference {stored.profileReference}.</p>
            {stored.accountMemo ? (
              <p className="text-xs text-muted-foreground">
                Last memo {stored.accountMemo}
              </p>
            ) : null}
          </div>
        ) : stored.accountMemo ? (
          <>Last memo {stored.accountMemo}</>
        ) : (
          "Profile cached locally."
        ),
        timestamp: PLACEHOLDER_TIMESTAMP,
      };
      setActivity([profileActivity, ...initialActivity]);
    } else {
      setFormDefaults(emptyProfile);
      setLastInboundTopicId(undefined);
      setLastOutboundTopicId(undefined);
      setLastProfileTopicId(undefined);
      setActivity(initialActivity);
      setStoredProfile(null);
      setAccountMemo(undefined);
      setProfileDocument(null);
      setViewError(null);
      setViewLoading(false);
    }

    const cachedDocument = readAccountData<LoadedProfileDocument | null>(
      storageNamespaces.profileDocument,
      accountId,
      null,
    );
    if (cachedDocument?.reference) {
      setProfileDocument(cachedDocument);
    }
  }, [accountId, logger]);

  useEffect(() => {
    if (!accountId) {
      setPrefillLoading(false);
      prefillAttemptKeyRef.current = null;
      prefillInFlightKeyRef.current = null;
      return;
    }

    const referenceFromMemo = extractProfileReferenceFromMemo(accountMemo);
    const network =
      walletNetwork === "mainnet" || walletNetwork === "testnet"
        ? walletNetwork
        : env.HEDERA_NETWORK === "mainnet"
          ? "mainnet"
          : "testnet";

    const attemptKey = `${accountId}:${network}:${accountMemo ?? "no-memo"}`;

    if (!isFormEmpty(formDefaults)) {
      return;
    }

    if (
      prefillAttemptKeyRef.current === attemptKey ||
      prefillInFlightKeyRef.current === attemptKey
    ) {
      return;
    }

    prefillInFlightKeyRef.current = attemptKey;
    setPrefillLoading(true);

    let cancelled = false;

    const resolveFromAccountMemo = async () => {
      const client = new HCS11Client({
        network,
        auth: { operatorId: accountId },
        silent: true,
        logLevel: "warn",
      });

      const response = await client.fetchProfileByAccountId(accountId, network);
      if (!response.success || !response.profile) {
        throw new Error(response.error ?? "Profile not found for this account");
      }

      return { profile: response.profile, topicInfo: response.topicInfo };
    };

    const run = async () => {
      try {
        setViewError(null);
        const resolved = await resolveFromAccountMemo();

        if (cancelled) {
          return;
        }

        const draft = getDraftFromHcs11Profile(resolved.profile);
        const inboundTopicCandidate =
          draft.inboundTopicId ?? resolved.topicInfo?.inboundTopic;
        const outboundTopicCandidate =
          draft.outboundTopicId ?? resolved.topicInfo?.outboundTopic;
        const profileTopicCandidate =
          resolved.topicInfo?.profileTopicId;

        const inboundTopicId =
          inboundTopicCandidate && inboundTopicCandidate.trim().length > 0
            ? inboundTopicCandidate
            : undefined;
        const outboundTopicId =
          outboundTopicCandidate && outboundTopicCandidate.trim().length > 0
            ? outboundTopicCandidate
            : undefined;
        const profileTopicId =
          profileTopicCandidate && profileTopicCandidate.trim().length > 0
            ? profileTopicCandidate
            : undefined;

        setFormDefaults({
          alias: draft.alias,
          displayName: draft.displayName,
          avatarUrl: draft.avatarUrl,
          bio: draft.bio,
        });
        setLastInboundTopicId(inboundTopicId);
        setLastOutboundTopicId(outboundTopicId);
        setLastProfileTopicId(profileTopicId);

        const stored: StoredProfile = {
          alias: draft.alias,
          displayName: draft.displayName,
          avatarUrl: draft.avatarUrl,
          bio: draft.bio,
          inboundTopicId,
          outboundTopicId,
          profileTopicId,
          accountMemo,
          accountMemoVerified: Boolean(accountMemo),
          profileReference: referenceFromMemo ?? undefined,
        };

        writeAccountData(storageNamespaces.profile, accountId, stored, {
          ttlMs: 12 * 60 * 60 * 1000,
        });
        setStoredProfile(stored);
      } catch (error) {
        if (cancelled) {
          return;
        }
        const err = error instanceof Error ? error : new Error(String(error));
        if (isDebug) {
          logger.warn("profile:auto-load", err);
        }
        setViewError(err.message);
      } finally {
        if (prefillInFlightKeyRef.current === attemptKey) {
          prefillInFlightKeyRef.current = null;
        }
        setPrefillLoading(false);
        if (!cancelled) {
          prefillAttemptKeyRef.current = attemptKey;
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      if (prefillInFlightKeyRef.current === attemptKey) {
        prefillInFlightKeyRef.current = null;
      }
      setPrefillLoading(false);
    };
  }, [
    accountId,
    storedProfile,
    accountMemo,
    logger,
    walletNetwork,
    formDefaults,
    isFormEmpty,
  ]);

  useEffect(() => {
    if (!accountId) {
      return;
    }
    let cancelled = false;
    lookupAccount(accountId)
      .then((account) => {
        if (cancelled) {
          return;
        }
        if (account?.memo) {
          setAccountMemo(account.memo);
        }
      })
      .catch((error) => {
        if (isDebug) {
          logger.warn("profile:lookup-account", error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, logger]);

  const profileReference = useMemo(() => {
    if (storedProfile?.profileReference) {
      return storedProfile.profileReference;
    }
    return extractProfileReferenceFromMemo(accountMemo);
  }, [storedProfile, accountMemo]);

  const canViewProfile = Boolean(profileReference);

  const handleSubmit = async (values: ProfileFormValues) => {
    if (!signer || !accountId) {
      throw new Error("Connect a wallet before publishing a profile.");
    }
    if (!topicsReady) {
      throw new Error(
        topicsBootstrapError ??
          (topicsBootstrapping
            ? "Initializing registry topics. Approve the WalletConnect prompts to continue."
            : "Registry topics are not configured yet."),
      );
    }

    const profileFlowSteps: Array<{ id: ProfilePublishingStep; label: string }> = [
      { id: "ensure-inbound", label: "Ensure inbound topic" },
      { id: "ensure-outbound", label: "Ensure outbound topic" },
      { id: "inscribe-profile", label: "Upload profile document" },
      { id: "update-memo", label: "Update account memo" },
      { id: "verify-memo", label: "Verify memo on mirror" },
      { id: "publish-registry", label: "Publish registry entry" },
    ];

    const flowController = startFlow({
      title: "Publishing profile",
      subtitle: accountId,
      steps: profileFlowSteps,
    });

    let activeStep: ProfilePublishingStep = "ensure-inbound";

    const handleEvent = (event: ProfilePublishingEvent) => {
      if (event.type === "start") {
        activeStep = event.step;
        flowController.activateStep(event.step, event.message);
      } else if (event.type === "progress") {
        flowController.setStepProgress(
          event.step,
          event.progressPercent,
          event.message,
        );
      } else if (event.type === "success") {
        flowController.completeStep(event.step, event.message);
      } else {
        flowController.skipStep(event.step, event.message);
      }
    };

    try {
      const result = await createOrUpdateProfile(
        {
          accountId,
          alias: values.alias.toLowerCase(),
          displayName: values.displayName,
          avatarUrl: values.avatarUrl || undefined,
          bio: values.bio || undefined,
          inboundTopicId: lastInboundTopicId,
          outboundTopicId: lastOutboundTopicId,
          profileTopicId: lastProfileTopicId,
        },
        signer,
        { payerAccountId: accountId, onStep: handleEvent, network: walletNetwork },
      );

      setLastInboundTopicId(result.inboundTopicId);
      setLastOutboundTopicId(result.outboundTopicId);
      setLastProfileTopicId(result.profileTopicId);

      const stored: StoredProfile = {
        ...values,
        inboundTopicId: result.inboundTopicId,
        outboundTopicId: result.outboundTopicId,
        accountMemo: result.accountMemo,
        accountMemoVerified: result.accountMemoVerified,
        profileTopicId: result.profileTopicId,
        profileReference: result.profileReference,
      };
      writeAccountData(storageNamespaces.profile, accountId, stored, {
        ttlMs: 12 * 60 * 60 * 1000,
      });
      setFormDefaults(values);
      setStoredProfile(stored);
      setAccountMemo(result.accountMemo);
      setProfileDocument(null);
      setViewError(null);
      removeAccountData(storageNamespaces.profileDocument, accountId);

      const registryTopicId =
        tryGetTopicId(
          "profileRegistry",
          "environment",
          walletNetwork === "mainnet" ? "mainnet" : "testnet",
        ) ??
        (() => {
          throw new Error("Profile registry topic is not configured.");
        })();
      const registryLink = topicExplorerUrl(registryTopicId, walletNetwork);
      const inboundLink = topicExplorerUrl(result.inboundTopicId);
      const profileLink = topicExplorerUrl(result.profileTopicId);
      const memoStatusCopy = result.accountMemoVerified
        ? "Account memo confirmed via mirror"
        : "Waiting for mirror confirmation";

      setActivity((existing) => [
        {
          id: `registry-${result.registryReceipt.sequenceNumber ?? Date.now()}`,
          author: "Registry",
          content: (
            <div className="space-y-1">
              <p>Profile saved. Memo {result.accountMemo}.</p>
              <p className="text-xs text-muted-foreground">
                Profile reference {result.profileReference}
              </p>
              <p className="text-xs text-muted-foreground">{memoStatusCopy}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                <a
                  href={registryLink}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-brand-blue hover:text-brand-purple"
                >
                  View registry topic
                </a>
                <a
                  href={inboundLink}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-brand-blue hover:text-brand-purple"
                >
                  View inbox topic
                </a>
                <a
                  href={profileLink}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-brand-blue hover:text-brand-purple"
                >
                  View profile document
                </a>
              </div>
            </div>
          ),
          timestamp:
            result.registryReceipt.consensusTimestamp ?? new Date().toISOString(),
        },
        ...existing,
      ]);

      flowController.finish("Profile published successfully");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save profile";
      flowController.failStep(activeStep, message);
      throw error;
    }
  };

  const handleViewProfile = useCallback(async () => {
    if (!accountId) {
      return;
    }
    setViewError(null);
    setViewLoading(true);
    try {
      let reference: string | null =
        storedProfile?.profileReference ?? extractProfileReferenceFromMemo(accountMemo) ?? null;
      if (!reference) {
        const account = await lookupAccount(accountId);
        if (account?.memo) {
          setAccountMemo(account.memo);
          reference = extractProfileReferenceFromMemo(account.memo);
        }
      }

      if (!reference) {
        throw new Error("Account memo does not reference an HCS-11 profile yet.");
      }

      const document = await loadProfileDocument(reference);
      setProfileDocument(document);
      writeAccountData(storageNamespaces.profileDocument, accountId, document, {
        ttlMs: 6 * 60 * 60 * 1000,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load profile document.";
      setViewError(message);
    } finally {
      setViewLoading(false);
    }
  }, [accountId, storedProfile?.profileReference, accountMemo]);

  return (
    <section className="space-y-8">
      <Card className="space-y-3 rounded-3xl p-6 shadow-lg backdrop-blur">
        <p className="text-sm font-medium text-brand-blue">Identity</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Profile</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Manage your HCS-11 profile, publish updates to the registry, and
          review on-chain metadata tied to the current identity.
        </p>
      </Card>
      <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <FormShell
          title="Profile Details"
          description="Collect alias, display information, and link inbound topics."
          actions={
            !walletAccountId ? (
              <ConnectWalletButton />
            ) : canViewProfile ? (
              <Button
                type="button"
                onClick={handleViewProfile}
                disabled={viewLoading}
                title={profileDocument ? "Refresh published profile" : undefined}
                className="rounded-full bg-gradient-to-r from-brand-blue to-brand-purple px-5 py-2 font-semibold text-white shadow-brand-blue ring-1 ring-brand-blue/40 transition hover:shadow-brand-purple"
              >
                {viewLoading ? "Loading…" : "View Profile"}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Account memo does not reference an HCS-11 profile yet.
              </p>
            )
          }
        >
          {viewError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {viewError}
            </div>
          ) : prefillLoading && isFormEmpty(formDefaults) ? (
            <div className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
              Loading on-chain profile…
            </div>
          ) : null}
          <AuthRequired
            enabled={Boolean(signer)}
            title="Wallet required"
            description="Connect your wallet to publish or update a profile."
          >
            <ProfileForm
              initialValues={formDefaults}
              onSubmit={handleSubmit}
              disabled={!signer || topicsBootstrapping || !topicsReady}
              signer={signer}
              network={walletNetwork}
              disabledMessage={
                !signer
                  ? "Connect your wallet to publish or update a profile."
                  : topicsBootstrapError ??
                    (topicsBootstrapping
                      ? "Initializing registry topics. Approve the WalletConnect prompts to continue."
                      : "Registry topics are not configured yet.")
              }
            />
          </AuthRequired>
        </FormShell>
        <div className="space-y-4">
          <FormShell
            title="Activity"
            description="Latest registry messages and account memo snapshots."
          >
            <TopicMessageList items={activity} />
          </FormShell>
          {profileDocument ? (
            <FormShell
              title="Published Profile"
              description="Decoded snapshot from the HCS-1 profile document."
            >
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-xs font-medium uppercase text-muted-foreground">
                    Display Name
                  </p>
                  <p className="text-foreground">{profileDocument.profile.display_name}</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Alias</p>
                    <p className="text-foreground">{profileDocument.profile.alias ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">UAID</p>
                    <p className="break-all text-foreground">{profileDocument.profile.uaid}</p>
                  </div>
                </div>
                {profileDocument.profile.bio ? (
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Bio</p>
                    <p className="text-foreground">{profileDocument.profile.bio}</p>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      Inbound Topic
                    </p>
                    <p className="text-foreground">
                      {profileDocument.profile.inboundTopicId ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      Outbound Topic
                    </p>
                    <p className="text-foreground">
                      {profileDocument.profile.outboundTopicId ?? "—"}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      Profile Topic
                    </p>
                    <a
                      href={topicExplorerUrl(profileDocument.topicId)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground underline decoration-dotted underline-offset-2"
                    >
                      {profileDocument.topicId}
                    </a>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Reference</p>
                    <p className="break-all text-foreground">{profileDocument.reference}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Checksum</p>
                    <p className="break-all text-foreground">{profileDocument.memoHash}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Integrity</p>
                    <p className={profileDocument.checksumValid ? "text-emerald-600" : "text-rose-600"}>
                      {profileDocument.checksumValid ? "Verified" : "Mismatch"}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">Chunks</p>
                    <p className="text-foreground">{profileDocument.chunkCount}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      Retrieved
                    </p>
                    <p className="text-foreground">
                      {new Date(profileDocument.retrievedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <details className="rounded-md border border-border bg-muted p-3">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                    View raw JSON
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-background p-3 text-xs text-muted-foreground">
                    {profileDocument.rawJson}
                  </pre>
                </details>
              </div>
            </FormShell>
          ) : null}
        </div>
      </div>
    </section>
  );
}
