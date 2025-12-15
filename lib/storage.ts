const STORAGE_VERSION = "1";
const PREFIX = `petal-v${STORAGE_VERSION}`;

export const storageNamespaces = {
  petals: "petals",
  floras: "floras",
  floraInvites: "flora-invites",
  floraPrefs: "flora-prefs",
  inbox: "inbox",
  profile: "profile",
  profileDocument: "profile-document",
  connections: "connections",
} as const;

type Namespace = string;

type StoredEntry<T> = {
  value: T;
  updatedAt: number;
  ttlMs?: number;
};

type WriteOptions = {
  ttlMs?: number;
};

function accountKey(namespace: Namespace, accountId: string): string {
  return `${PREFIX}:${namespace}:${accountId}`;
}

function isStoredEntry<T>(value: unknown): value is StoredEntry<T> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<StoredEntry<T>>;
  return (
    Object.prototype.hasOwnProperty.call(candidate, "value") &&
    Object.prototype.hasOwnProperty.call(candidate, "updatedAt")
  );
}

export function readAccountData<T>(
  namespace: Namespace,
  accountId: string | null,
  fallback: T,
): T {
  if (typeof window === "undefined" || !accountId) {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(accountKey(namespace, accountId));
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw) as unknown;

    if (isStoredEntry<T>(parsed)) {
      const { value, updatedAt, ttlMs } = parsed;
      if (ttlMs && updatedAt + ttlMs < Date.now()) {
        window.localStorage.removeItem(accountKey(namespace, accountId));
        return fallback;
      }
      return value;
    }

    return parsed as T;
  } catch (error) {
    void error;
    return fallback;
  }
}

export function writeAccountData<T>(
  namespace: Namespace,
  accountId: string | null,
  value: T,
  options: WriteOptions = {},
): void {
  if (typeof window === "undefined" || !accountId) {
    return;
  }
  try {
    const entry: StoredEntry<T> = {
      value,
      updatedAt: Date.now(),
      ttlMs: options.ttlMs,
    };
    window.localStorage.setItem(accountKey(namespace, accountId), JSON.stringify(entry));
  } catch (error) {
    void error;
  }
}

export function removeAccountData(namespace: Namespace, accountId: string | null): void {
  if (typeof window === "undefined" || !accountId) {
    return;
  }
  window.localStorage.removeItem(accountKey(namespace, accountId));
}

export function clearAccountData(accountId: string | null): void {
  if (typeof window === "undefined" || !accountId) {
    return;
  }
  Object.values(storageNamespaces).forEach((namespace) => {
    removeAccountData(namespace, accountId);
  });
}

export function clearAllStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  const keysToRemove: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(PREFIX)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => window.localStorage.removeItem(key));
}

export type StorageSnapshotEntry = {
  key: string;
  namespace: string;
  accountId?: string;
  updatedAt?: number;
  ttlMs?: number;
  expiresAt?: number;
  value: unknown;
};

export function collectStorageSnapshot(): StorageSnapshotEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  const entries: StorageSnapshotEntry[] = [];

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key || !key.startsWith(PREFIX)) {
      continue;
    }

    const raw = window.localStorage.getItem(key);
    if (!raw) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }

    const [, namespace = "", accountId] = key.split(":");

    if (isStoredEntry<unknown>(parsed)) {
      entries.push({
        key,
        namespace,
        accountId,
        updatedAt: parsed.updatedAt,
        ttlMs: parsed.ttlMs,
        expiresAt: parsed.ttlMs ? parsed.updatedAt + parsed.ttlMs : undefined,
        value: parsed.value,
      });
      continue;
    }

    entries.push({ key, namespace, accountId, value: parsed });
  }

  return entries;
}
