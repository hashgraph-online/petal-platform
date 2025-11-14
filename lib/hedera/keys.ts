import { Buffer } from "buffer";
import { Key, PublicKey } from "@hashgraph/sdk";
import type { DAppSigner } from "@hashgraph/hedera-wallet-connect";
import { lookupAccount } from "@/lib/hedera/mirror";

type MirrorKey = {
  _type?: string;
  key?: string;
};

function tryPublicKeyFromString(value: string): PublicKey | null {
  try {
    return PublicKey.fromString(value);
  } catch {
    return null;
  }
}

function tryPublicKeyFromBytes(bytes: Uint8Array): PublicKey | null {
  try {
    return PublicKey.fromBytes(bytes);
  } catch {
    return null;
  }
}

function parseUnknownKey(rawKey: unknown): PublicKey | null {
  if (!rawKey) {
    return null;
  }
  if (rawKey instanceof PublicKey) {
    return rawKey;
  }
  if (typeof rawKey === "string" && rawKey.trim().length > 0) {
    return tryPublicKeyFromString(rawKey.trim());
  }
  if (rawKey instanceof Uint8Array) {
    const parsed = tryPublicKeyFromBytes(rawKey);
    if (parsed) {
      return parsed;
    }
    const hex = Array.from(rawKey)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    return tryPublicKeyFromString(hex);
  }
  if (typeof rawKey === "object") {
    return deriveFromSdkKey(rawKey as Key);
  }
  return null;
}

function deriveFromSdkKey(key: Key | null | undefined): PublicKey | null {
  if (!key) {
    return null;
  }
  if (key instanceof PublicKey) {
    return key;
  }
  const candidate = key as {
    toBytesRaw?: () => Uint8Array;
    toBytes?: () => Uint8Array;
    toStringRaw?: () => string;
    toString?: () => string;
  };

  if (typeof candidate.toBytesRaw === "function") {
    const parsed = tryPublicKeyFromBytes(candidate.toBytesRaw());
    if (parsed) {
      return parsed;
    }
  }
  if (typeof candidate.toBytes === "function") {
    const parsed = tryPublicKeyFromBytes(candidate.toBytes());
    if (parsed) {
      return parsed;
    }
  }
  if (typeof candidate.toStringRaw === "function") {
    const parsed = tryPublicKeyFromString(candidate.toStringRaw());
    if (parsed) {
      return parsed;
    }
  }
  if (typeof candidate.toString === "function") {
    const parsed = tryPublicKeyFromString(candidate.toString());
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

export async function getSignerPublicKey(
  signer: DAppSigner,
  fallbackAccountId?: string | null,
): Promise<PublicKey | null> {
  if (!signer) {
    return null;
  }

  let resolved: PublicKey | null = null;

  if (typeof signer.getAccountKey === "function") {
    try {
      const rawKeyResult = signer.getAccountKey() as unknown;
      const rawKey =
        typeof (rawKeyResult as PromiseLike<unknown>)?.then === "function"
          ? await (rawKeyResult as PromiseLike<unknown>)
          : rawKeyResult;
      resolved = parseUnknownKey(rawKey);
    } catch (error) {
      if (!(error instanceof Error) || !/Method not implemented/i.test(error.message)) {
        console.warn("hedera:getSignerPublicKey:getAccountKey", error);
      }
    }
  }

  if (!resolved) {
    try {
      const fallbackId = fallbackAccountId ?? signer.getAccountId?.().toString();
      if (fallbackId) {
        const account = await lookupAccount(fallbackId).catch(() => null);
        resolved = publicKeyFromMirrorKey(account?.key);
      }
    } catch (error) {
      console.warn("hedera:getSignerPublicKey:lookupAccount", error);
    }
  }

  return resolved;
}

export async function getSignerPublicKeyString(
  signer: DAppSigner,
  fallbackAccountId?: string | null,
): Promise<string | null> {
  const publicKey = await getSignerPublicKey(signer, fallbackAccountId);
  if (!publicKey) {
    return null;
  }
  if (typeof publicKey.toStringRaw === "function") {
    try {
      const raw = publicKey.toStringRaw();
      if (raw && raw !== "[object Object]") {
        return raw;
      }
    } catch {
      // fall through to default string conversion
    }
  }
  return publicKey.toString();
}

export function publicKeyFromMirrorKey(entry: MirrorKey | null | undefined): PublicKey | null {
  if (!entry?.key) {
    return null;
  }

  const { key, _type } = entry;
  const sanitized = key.trim();
  const isHex = /^[0-9a-fA-F]+$/.test(sanitized.replace(/^0x/i, ""));
  const normalized = sanitized.startsWith("0x") ? sanitized.slice(2) : sanitized;

  try {
    const bytes = isHex ? Buffer.from(normalized, "hex") : Buffer.from(sanitized, "base64");
    if (_type?.toUpperCase().includes("ED25519")) {
      return PublicKey.fromBytesED25519(bytes);
    }
    if (_type?.toUpperCase().includes("ECDSA")) {
      return PublicKey.fromBytesECDSA(bytes);
    }
    const parsed = tryPublicKeyFromBytes(bytes);
    if (parsed) {
      return parsed;
    }
  } catch (error) {
    console.warn("hedera:publicKeyFromMirrorKey", error);
  }

  const hex = isHex ? normalized : Buffer.from(sanitized, "base64").toString("hex");
  return tryPublicKeyFromString(hex);
}
