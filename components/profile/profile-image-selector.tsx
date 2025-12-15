"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { HolderInscriptionsResponse } from "@kiloscribe/inscription-sdk";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/Spinner";
import type { DAppSigner } from "@/lib/hedera/wallet-types";
import { requireWalletConnectSigner } from "@/lib/hedera/wallet-types";

type Network = "mainnet" | "testnet";

type ProfileImageSelectorProps = {
  value: string;
  onChange: (value: string) => void;
  network: Network;
  signer: DAppSigner | null;
  disabled?: boolean;
};

function toCdnUrl(topicId: string, network: Network): string {
  return `https://kiloscribe.com/api/inscription-cdn/${topicId}?network=${network}`;
}

function normalizeHcsImageValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("hcs://1/")) {
    return trimmed;
  }
  if (/^\d+\.\d+\.\d+$/u.test(trimmed)) {
    return `hcs://1/${trimmed}`;
  }
  return trimmed;
}

function extractTopicId(value: string): string | null {
  const normalized = normalizeHcsImageValue(value);
  if (!normalized.startsWith("hcs://1/")) {
    return null;
  }
  const topicId = normalized.replace("hcs://1/", "");
  if (!/^\d+\.\d+\.\d+$/u.test(topicId)) {
    return null;
  }
  return topicId;
}

function filterCompletedImages(items: HolderInscriptionsResponse): HolderInscriptionsResponse {
  return items.filter((item) => item.completed && typeof item.topic_id === "string" && item.topic_id.length > 0);
}

export function ProfileImageSelector({
  value,
  onChange,
  network,
  signer,
  disabled = false,
}: ProfileImageSelectorProps) {
  const [activeTab, setActiveTab] = useState<"url" | "hcs">(() =>
    value?.startsWith("hcs://") ? "hcs" : "url",
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [inscriptions, setInscriptions] = useState<HolderInscriptionsResponse>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isInscribing, setIsInscribing] = useState(false);
  const [inscribeMessage, setInscribeMessage] = useState<string | null>(null);
  const [inscribeProgress, setInscribeProgress] = useState<number>(0);
  const [inscribeError, setInscribeError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hasFetchedRef = useRef<string | null>(null);

  useEffect(() => {
    setActiveTab(value?.startsWith("hcs://") ? "hcs" : "url");
  }, [value]);

  const walletSigner = useMemo(() => {
    if (!signer) {
      return null;
    }
    try {
      return requireWalletConnectSigner(signer, "Connect your wallet to manage inscriptions.");
    } catch {
      return null;
    }
  }, [signer]);

  const holderId = useMemo(() => {
    try {
      return walletSigner?.getAccountId().toString() ?? null;
    } catch {
      return null;
    }
  }, [walletSigner]);

  const selectedTopicId = useMemo(() => extractTopicId(value), [value]);
  const selectedPreviewUrl = useMemo(() => {
    if (!selectedTopicId) {
      return null;
    }
    return toCdnUrl(selectedTopicId, network);
  }, [selectedTopicId, network]);

  const urlFieldValue = useMemo(() => {
    if (activeTab !== "url") {
      return "";
    }
    if (!value || value.startsWith("hcs://")) {
      return "";
    }
    return value;
  }, [activeTab, value]);

  const hcsFieldValue = useMemo(() => {
    if (activeTab !== "hcs") {
      return "";
    }
    if (!value || !value.startsWith("hcs://")) {
      return "";
    }
    return value;
  }, [activeTab, value]);

  const loadInscriptions = useCallback(async () => {
    if (!walletSigner || !holderId) {
      setLoadError("Connect your wallet to view previous inscriptions.");
      return;
    }

    const cacheKey = `${network}:${holderId}`;
    if (hasFetchedRef.current === cacheKey) {
      return;
    }

    setLoading(true);
    setLoadError(null);
    try {
      const { InscriptionSDK } = await import("@kiloscribe/inscription-sdk");
      const sdk = await InscriptionSDK.createWithAuth({
        type: "client",
        accountId: holderId,
        signer: walletSigner,
        network,
        connectionMode: "http",
      });
      const response = await sdk.getHolderInscriptions({ holderId, includeCollections: false });
      setInscriptions(filterCompletedImages(response));
      hasFetchedRef.current = cacheKey;
    } catch (error) {
      setInscriptions([]);
      setLoadError(error instanceof Error ? error.message : "Failed to load inscriptions.");
    } finally {
      setLoading(false);
    }
  }, [walletSigner, holderId, network]);

  const openModal = useCallback(() => {
    setModalOpen(true);
    setSearchQuery("");
    void loadInscriptions();
  }, [loadInscriptions]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  const handleSelect = useCallback(
    (topicId: string) => {
      onChange(`hcs://1/${topicId}`);
      setActiveTab("hcs");
      setModalOpen(false);
    },
    [onChange],
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      if (!file) {
        return;
      }

      if (!walletSigner) {
        setInscribeError("Connect your wallet to inscribe images.");
        return;
      }

      setInscribeError(null);
      setIsInscribing(true);
      setInscribeProgress(0);
      setInscribeMessage("Preparing upload…");

      try {
        const { inscribeWithSigner } = await import("@hashgraphonline/standards-sdk");
        const buffer = await file.arrayBuffer();
        const result = await inscribeWithSigner(
          {
            type: "buffer",
            buffer,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
          },
          walletSigner,
          {
            network,
            mode: "file",
            fileStandard: "1",
            waitForConfirmation: true,
            progressCallback: (progress) => {
              if (typeof progress?.message === "string") {
                setInscribeMessage(progress.message);
              }
              if (typeof progress?.progressPercent === "number" && Number.isFinite(progress.progressPercent)) {
                setInscribeProgress(Math.max(0, Math.min(100, Math.round(progress.progressPercent))));
              }
            },
            logging: { level: "warn" },
          },
        );

        const topicIdFromInscription =
          typeof result.inscription?.topic_id === "string"
            ? result.inscription.topic_id
            : typeof (result.result as { topic_id?: unknown })?.topic_id === "string"
              ? ((result.result as { topic_id: string }).topic_id)
              : null;

        if (!result.confirmed || !topicIdFromInscription) {
          throw new Error("Inscription did not return a topic ID.");
        }

        onChange(`hcs://1/${topicIdFromInscription}`);
        setActiveTab("hcs");
        setInscribeProgress(100);
        setInscribeMessage("Inscription complete.");
        hasFetchedRef.current = null;
      } catch (error) {
        setInscribeError(error instanceof Error ? error.message : "Failed to inscribe image.");
      } finally {
        setIsInscribing(false);
        if (event.target) {
          event.target.value = "";
        }
      }
    },
    [walletSigner, network, onChange],
  );

  const handleClear = useCallback(() => {
    onChange("");
    setInscribeError(null);
    setInscribeMessage(null);
    setInscribeProgress(0);
  }, [onChange]);

  const filteredInscriptions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return inscriptions;
    }
    return inscriptions.filter((item) => {
      const topicId = (item.topic_id || "").toLowerCase();
      const name = (item.name || "").toLowerCase();
      return topicId.includes(query) || name.includes(query);
    });
  }, [inscriptions, searchQuery]);

  const modal = modalOpen
    ? createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 px-4 py-8" role="dialog" aria-modal="true">
          <Card className="w-full max-w-3xl rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-blue">HCS-1 inscriptions</p>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Select a profile image</h2>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Choose a previously inscribed file from your wallet.
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={closeModal} className="rounded-full">
                Close
              </Button>
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                name="inscriptionSearch"
                placeholder="Search by topic ID or name…"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                disabled={disabled}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  hasFetchedRef.current = null;
                  void loadInscriptions();
                }}
                disabled={disabled || loading}
                className="rounded-full"
              >
                {loading ? "Refreshing…" : "Refresh"}
              </Button>
            </div>

            {loadError ? (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-100">
                {loadError}
              </div>
            ) : null}

            {loading ? (
              <div className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <Spinner size="sm" /> Loading inscriptions…
              </div>
            ) : (
              <div className="mt-6 grid max-h-[50vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                {filteredInscriptions.length === 0 ? (
                  <div className="col-span-full rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    No inscriptions found for this wallet.
                  </div>
                ) : (
                  filteredInscriptions.map((item) => {
                    const topicId = item.topic_id;
                    const previewUrl = toCdnUrl(topicId, network);
                    return (
                      <button
                        type="button"
                        key={item.id || topicId}
                        onClick={() => handleSelect(topicId)}
                        className="group text-left"
                        disabled={disabled}
                      >
                        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:border-brand-blue/60 hover:shadow-md dark:border-gray-700 dark:bg-gray-900">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={previewUrl}
                            alt={item.name ? String(item.name) : `Inscription ${topicId}`}
                            className="h-40 w-full object-cover bg-gray-100 dark:bg-gray-800"
                            loading="lazy"
                          />
                          <div className="space-y-1 p-3">
                            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">
                              {item.name ? String(item.name) : "Untitled inscription"}
                            </p>
                            <p className="truncate text-xs text-gray-600 dark:text-gray-300">
                              Topic {topicId}
                            </p>
                            <p className="text-xs text-brand-blue opacity-0 transition group-hover:opacity-100">
                              Select
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </Card>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-holNavy">Profile picture</p>
          <p className="text-xs text-holNavy/60">
            Upload an image to HCS-1 or provide a URL.
          </p>
        </div>
        {value ? (
          <Button type="button" variant="ghost" size="sm" onClick={handleClear} disabled={disabled} className="rounded-full">
            Clear
          </Button>
        ) : null}
      </div>

      <div className="inline-flex rounded-full border border-gray-200 bg-white p-1 shadow-inner dark:border-gray-700 dark:bg-gray-900">
        <button
          type="button"
          onClick={() => setActiveTab("url")}
          disabled={disabled}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
            activeTab === "url"
              ? "bg-brand-blue text-white shadow-sm"
              : "text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-50"
          }`}
        >
          URL
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("hcs")}
          disabled={disabled}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
            activeTab === "hcs"
              ? "bg-brand-purple text-white shadow-sm"
              : "text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-50"
          }`}
        >
          HCS Upload
        </button>
      </div>

      {activeTab === "url" ? (
        <div className="space-y-2">
          <Input
            type="url"
            name="avatarUrl"
            value={urlFieldValue}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled}
            placeholder="https://cdn.hol.org/avatars/alice.png"
          />
          <p className="text-xs text-holNavy/60">Enter a direct URL to your profile image.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={openModal}
              disabled={disabled || !walletSigner}
              className="rounded-full"
            >
              Select from inscriptions
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleUploadClick}
              disabled={disabled || !walletSigner || isInscribing}
              className="rounded-full"
            >
              {isInscribing ? "Inscribing…" : "Inscribe new image"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelected}
              className="hidden"
            />
          </div>

          <div className="space-y-2">
            <Input
              name="avatarHcs"
              value={hcsFieldValue}
              onChange={(event) => onChange(normalizeHcsImageValue(event.target.value))}
              disabled={disabled}
              placeholder="hcs://1/0.0.12345"
            />
            <p className="text-xs text-holNavy/60">
              Use an HCS-1 reference (recommended) like <span className="font-mono">hcs://1/0.0.x</span>.
            </p>
          </div>

          {selectedPreviewUrl ? (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedPreviewUrl}
                alt="Selected profile image"
                className="h-44 w-full object-cover bg-gray-100 dark:bg-gray-800"
                loading="lazy"
              />
              <div className="p-3">
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  Topic <span className="font-mono">{selectedTopicId}</span>
                </p>
              </div>
            </div>
          ) : null}

          {inscribeError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-100">
              {inscribeError}
            </div>
          ) : null}

          {inscribeMessage ? (
            <div className="space-y-1">
              <p className="text-sm text-brand-blue">{inscribeMessage}</p>
              {inscribeProgress > 0 ? (
                <div className="h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-1.5 bg-brand-green rounded-full transition-all"
                    style={{ width: `${Math.max(0, Math.min(100, inscribeProgress))}%` }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {modal}
    </div>
  );
}
