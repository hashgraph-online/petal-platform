"use client";

import type { HCS11Profile } from "@hashgraphonline/standards-sdk";

export type Hcs11ProfileDraft = {
  alias: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  inboundTopicId?: string;
  outboundTopicId?: string;
};

export function getDraftFromHcs11Profile(profile: HCS11Profile): Hcs11ProfileDraft {
  return {
    alias: profile.alias ?? "",
    displayName: profile.display_name,
    avatarUrl: profile.profileImage ?? "",
    bio: profile.bio ?? "",
    inboundTopicId: profile.inboundTopicId,
    outboundTopicId: profile.outboundTopicId,
  };
}

