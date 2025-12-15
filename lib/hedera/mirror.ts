import axios, { AxiosError } from "axios";
import type { AxiosRequestConfig } from "axios";
import useSWR, { SWRConfiguration, mutate as globalMutate } from "swr";
import { env, getMirrorNodeUrl } from "@/config/env";

export type MirrorTopicMessage = {
  consensusTimestamp: string;
  sequenceNumber: number;
  message?: string;
  runningHash?: string;
  chunkInfo?: {
    number: number;
    total: number;
  };
};

export type MirrorAccount = {
  account: string;
  evmAddress?: string;
  alias?: string;
  key?: {
    _type: string;
    key: string;
  };
  balance?: {
    balance: number;
    timestamp: string;
    tokens?: Array<{
      token_id: string;
      balance: number;
    }>;
  };
  memo?: string;
};

type FetchMessagesParams = {
  limit?: number;
  order?: "asc" | "desc";
  next?: string;
};

const DEFAULT_RETRIES = 3;

export type MirrorTopicInfo = {
  topic_id: string;
  memo?: string;
  running_hash?: string;
  sequence_number?: number;
  submit_key?: unknown;
  admin_key?: unknown;
  auto_renew_account?: string;
  auto_renew_period?: number;
};

type MirrorTopicMessagesResponse = {
  messages: MirrorTopicMessage[];
  links?: {
    next?: string | null;
  };
};

type MirrorPerformanceState = {
  lastRequestMs: number;
  totalRequestMs: number;
  samples: number;
  lastErrorStatus: number | null;
};

const mirrorPerformance: MirrorPerformanceState = {
  lastRequestMs: 0,
  totalRequestMs: 0,
  samples: 0,
  lastErrorStatus: null,
};

const nowMs = () => {
  if (typeof Date.now === "function") {
    return Date.now();
  }
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Number(new Date());
};

function recordMirrorPerformance(durationMs: number, meta: { status?: number; url: string; attempt: number; error?: boolean }) {
  mirrorPerformance.lastRequestMs = durationMs;
  mirrorPerformance.totalRequestMs += durationMs;
  mirrorPerformance.samples += 1;
  mirrorPerformance.lastErrorStatus = meta.error ? meta.status ?? null : null;
}

function buildMirrorUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  const base = env.NEXT_PUBLIC_MIRROR_NODE_URL.replace(/\/$/, "");
  if (path.startsWith("/")) {
    return `${base}${path}`;
  }
  return `${base}/${path}`;
}

function getMirrorBaseUrl(network?: "mainnet" | "testnet"): string {
  const resolvedNetwork =
    network ?? (env.HEDERA_NETWORK === "mainnet" ? "mainnet" : "testnet");
  return getMirrorNodeUrl(resolvedNetwork).replace(/\/$/, "");
}

export function getMirrorPerformance() {
  const averageRequestMs = mirrorPerformance.samples
    ? mirrorPerformance.totalRequestMs / mirrorPerformance.samples
    : 0;
  return {
    lastRequestMs: mirrorPerformance.lastRequestMs,
    averageRequestMs,
    samples: mirrorPerformance.samples,
    lastErrorStatus: mirrorPerformance.lastErrorStatus,
  };
}

export function getMirrorSuggestedRefreshInterval() {
  const { lastRequestMs, averageRequestMs } = getMirrorPerformance();
  const baseline = averageRequestMs > 0 ? averageRequestMs : 3_000;
  const latest = lastRequestMs > 0 ? lastRequestMs : baseline;
  const scaled = Math.max(latest, baseline) * 8;
  const interval = Math.round(Math.min(60_000, Math.max(15_000, scaled)));
  return interval;
}

export function __resetMirrorPerformanceForTests() {
  mirrorPerformance.lastRequestMs = 0;
  mirrorPerformance.totalRequestMs = 0;
  mirrorPerformance.samples = 0;
  mirrorPerformance.lastErrorStatus = null;
}

function toWebsocketUrl(httpUrl: string): string {
  if (httpUrl.startsWith("https://")) {
    return httpUrl.replace("https://", "wss://");
  }
  if (httpUrl.startsWith("http://")) {
    return httpUrl.replace("http://", "ws://");
  }
  return httpUrl;
}

async function httpGetWithRetry<T>(
  url: string,
  config: AxiosRequestConfig,
  retries = DEFAULT_RETRIES,
): Promise<T> {
  let attempt = 0;
  let delay = 500;

  for (;;) {
    const start = nowMs();
    try {
      const response = await axios.get<T>(url, config);
      const duration = nowMs() - start;
      recordMirrorPerformance(duration, {
        url,
        attempt: attempt + 1,
        status: response.status,
      });
      return response.data;
    } catch (error) {
      const duration = nowMs() - start;
      attempt += 1;
      const status = (error as AxiosError).response?.status;
      recordMirrorPerformance(duration, {
        url,
        attempt,
        status,
        error: true,
      });
      if (attempt > retries || (status && status < 500)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

export async function fetchTopicMessages(
  topicId: string,
  params: FetchMessagesParams = {},
): Promise<MirrorTopicMessage[]> {
  const data = await fetchTopicMessagesPage(topicId, params);
  return data.messages ?? [];
}

async function fetchTopicMessagesPage(
  topicId: string,
  params: FetchMessagesParams = {},
): Promise<MirrorTopicMessagesResponse> {
  const url = `${env.NEXT_PUBLIC_MIRROR_NODE_URL}/topics/${topicId}/messages`;
  return httpGetWithRetry<MirrorTopicMessagesResponse>(url, {
    params: {
      limit: params.limit ?? 50,
      order: params.order ?? "desc",
      next: params.next,
    },
  });
}

async function fetchTopicMessagesByUrl(url: string): Promise<MirrorTopicMessagesResponse> {
  return httpGetWithRetry<MirrorTopicMessagesResponse>(url, {});
}

export async function fetchAllTopicMessages(
  topicId: string,
  options: {
    order?: "asc" | "desc";
    pageSize?: number;
    pageLimit?: number;
  } = {},
): Promise<MirrorTopicMessage[]> {
  const messages: MirrorTopicMessage[] = [];
  const order = options.order ?? "asc";
  const pageSize = options.pageSize ?? 100;
  const pageLimit = options.pageLimit ?? 10;

  let response = await fetchTopicMessagesPage(topicId, {
    limit: pageSize,
    order,
  });
  messages.push(...(response.messages ?? []));

  let nextLink = response.links?.next ?? null;
  let pagesFetched = 1;

  while (nextLink && pagesFetched < pageLimit) {
    const absolute = buildMirrorUrl(nextLink);
    response = await fetchTopicMessagesByUrl(absolute);
    messages.push(...(response.messages ?? []));
    nextLink = response.links?.next ?? null;
    pagesFetched += 1;
  }

  return messages;
}

export async function fetchTopicInfo(
  topicId: string,
  network?: "mainnet" | "testnet",
): Promise<MirrorTopicInfo | null> {
  const url = `${getMirrorBaseUrl(network)}/topics/${topicId}`;
  try {
    return await httpGetWithRetry<MirrorTopicInfo>(url, {});
  } catch (error) {
    const status = (error as AxiosError).response?.status;
    if (status === 404) {
      return null;
    }
    throw error;
  }
}

export async function lookupAccount(
  accountId: string,
  network?: "mainnet" | "testnet",
): Promise<MirrorAccount | null> {
  const url = `${getMirrorBaseUrl(network)}/accounts/${accountId}`;

  try {
    const data = await httpGetWithRetry<MirrorAccount>(url, {});
    return data;
  } catch (error) {
    const status = (error as AxiosError).response?.status;
    if (status === 404) {
      return null;
    }
    throw error;
  }
}

type TopicMessageCallback = (message: MirrorTopicMessage) => void;

type SubscriptionOptions = {
  reconnect?: boolean;
  onError?: (error: Event) => void;
};

export function subscribeTopicWebsocket(
  topicId: string,
  onMessage: TopicMessageCallback,
  options: SubscriptionOptions = {},
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const wsBase = toWebsocketUrl(env.NEXT_PUBLIC_MIRROR_NODE_URL);
  const socket = new WebSocket(`${wsBase}/topics/${topicId}/messages?watch=true`);

  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data as string) as MirrorTopicMessage;
      onMessage(payload);
    } catch (error) {
      void error;
    }
  });

  if (options.onError) {
    socket.addEventListener("error", options.onError);
  }

  socket.addEventListener("close", () => {
    if (options.reconnect) {
      setTimeout(
        () => subscribeTopicWebsocket(topicId, onMessage, options),
        1_500,
      );
    }
  });

  return () => {
    socket.close();
  };
}

const swrFetcher = async <T>(key: string): Promise<T> => {
  const url = key;
  const response = await axios.get<T>(url);
  return response.data;
};

export function useTopicMessages(
  topicId: string | null,
  { limit = 50, order = "desc" }: FetchMessagesParams = {},
  config: SWRConfiguration = {},
) {
  const key = topicId
    ? `${env.NEXT_PUBLIC_MIRROR_NODE_URL}/topics/${topicId}/messages?limit=${limit}&order=${order}`
    : null;

  const swrConfig: SWRConfiguration = {
    revalidateOnFocus: false,
    ...config,
  };

  if (swrConfig.refreshInterval === undefined) {
    swrConfig.refreshInterval = getMirrorSuggestedRefreshInterval();
  }

  const swr = useSWR<{ messages: MirrorTopicMessage[] }>(key, swrFetcher, swrConfig);

  return {
    messages: swr.data?.messages ?? [],
    isLoading: swr.isLoading,
    error: swr.error,
    mutate: swr.mutate,
  };
}

export function mutateTopicMessages(topicId: string) {
  const key = `${env.NEXT_PUBLIC_MIRROR_NODE_URL}/topics/${topicId}/messages?limit=50&order=desc`;
  void globalMutate(key);
}
