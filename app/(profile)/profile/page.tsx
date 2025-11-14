"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { FormShell } from "@/components/forms/form-shell";
import { ProfileForm, type ProfileFormValues } from "@/components/profile/ProfileForm";
import { TopicMessageList } from "@/components/topics/topic-message-list";
import { topicExplorerUrl, getTopicId } from "@/config/topics";
import { isDebug } from "@/config/env";
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
  const { signer } = useWallet();
  const { activeIdentity } = useIdentity();
  const { startFlow } = useTransactionFlow();
  const accountId = activeIdentity?.accountId ?? null;
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
              <p className="text-xs text-slate-500">Last memo {stored.accountMemo}</p>
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
  }, [accountId]);

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
          console.warn("profile:lookup-account", error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accountId]);

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
        { payerAccountId: accountId, onStep: handleEvent },
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

      const registryLink = topicExplorerUrl(getTopicId("profileRegistry"));
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
              <p className="text-xs text-slate-500">
                Profile reference {result.profileReference}
              </p>
              <p className="text-xs text-slate-500">{memoStatusCopy}</p>
              <div className="flex flex-wrap gap-2 text-xs">
                <a
                  href={registryLink}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-violet-600 hover:text-violet-500"
                >
                  View registry topic
                </a>
                <a
                  href={inboundLink}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-violet-600 hover:text-violet-500"
                >
                  View inbox topic
                </a>
                <a
                  href={profileLink}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-violet-600 hover:text-violet-500"
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

  const handleViewProfile = async () => {
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
  };

  return (
    <section className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-violet-600">Identity</p>
        <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
        <p className="max-w-2xl text-sm text-slate-600">
          Manage your HCS-11 profile, publish updates to the registry, and
          review on-chain metadata tied to the current identity.
        </p>
      </header>
      <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <FormShell
          title="Profile Details"
          description="Collect alias, display information, and link inbound topics."
          actions={
            !accountId ? (
              <p className="text-sm text-slate-500">
                Connect your Hedera wallet to enable profile publishing.
              </p>
            ) : canViewProfile ? (
              <button
                type="button"
                onClick={handleViewProfile}
                disabled={viewLoading}
                title={profileDocument ? "Refresh published profile" : undefined}
                className="inline-flex items-center justify-center rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {viewLoading ? "Loading…" : "View Profile"}
              </button>
            ) : (
              <p className="text-sm text-slate-500">
                Account memo does not reference an HCS-11 profile yet.
              </p>
            )
          }
        >
          {viewError ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {viewError}
            </div>
          ) : null}
          <ProfileForm initialValues={formDefaults} onSubmit={handleSubmit} />
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
                  <p className="text-xs font-medium uppercase text-slate-500">Display Name</p>
                  <p className="text-slate-800">{profileDocument.profile.display_name}</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase text-slate-500">Alias</p>
                    <p className="text-slate-800">{profileDocument.profile.alias ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-slate-500">UAID</p>
                    <p className="break-all text-slate-800">{profileDocument.profile.uaid}</p>
                  </div>
                </div>
                {profileDocument.profile.bio ? (
                  <div>
                    <p className="text-xs font-medium uppercase text-slate-500">Bio</p>
                    <p className="text-slate-800">{profileDocument.profile.bio}</p>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase text-slate-500">Inbound Topic</p>
                    <p className="text-slate-800">{profileDocument.profile.inboundTopicId ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-slate-500">Outbound Topic</p>
                    <p className="text-slate-800">{profileDocument.profile.outboundTopicId ?? "—"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase text-slate-500">Profile Topic</p>
                    <a
                      href={topicExplorerUrl(profileDocument.topicId)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-800 underline decoration-dotted underline-offset-2"
                    >
                      {profileDocument.topicId}
                    </a>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-slate-500">Reference</p>
                    <p className="break-all text-slate-800">{profileDocument.reference}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase text-slate-500">Checksum</p>
                    <p className="break-all text-slate-800">{profileDocument.memoHash}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-slate-500">Integrity</p>
                    <p className={profileDocument.checksumValid ? "text-emerald-600" : "text-rose-600"}>
                      {profileDocument.checksumValid ? "Verified" : "Mismatch"}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-medium uppercase text-slate-500">Chunks</p>
                    <p className="text-slate-800">{profileDocument.chunkCount}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase text-slate-500">Retrieved</p>
                    <p className="text-slate-800">
                      {new Date(profileDocument.retrievedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <details className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-slate-600">
                    View raw JSON
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-white p-3 text-xs text-slate-700">
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
