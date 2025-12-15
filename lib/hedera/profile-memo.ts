"use client";

const PROFILE_MEMO_PREFIX = "hcs-11:";

const PROFILE_REFERENCE_PATTERN = /^hcs:\/\/\d+\/0\.0\.\d+$/i;

export function buildAccountMemo(profileReference: string): string {
  const memo = `${PROFILE_MEMO_PREFIX}${profileReference}`;
  return memo.length > 99 ? memo.slice(0, 99) : memo;
}

export function extractProfileReferenceFromMemo(memo?: string | null): string | null {
  if (!memo) {
    return null;
  }

  if (!memo.toLowerCase().startsWith(PROFILE_MEMO_PREFIX)) {
    return null;
  }

  const reference = memo.slice(PROFILE_MEMO_PREFIX.length).trim();
  return PROFILE_REFERENCE_PATTERN.test(reference) ? reference : null;
}

export function resolveProfileTopicId(reference: string): string | null {
  if (!reference) {
    return null;
  }

  const match = reference.match(/^hcs:\/\/\d+\/(0\.0\.\d+)$/i);
  return match?.[1] ?? null;
}

