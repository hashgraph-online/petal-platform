"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { DAppSigner } from "@hashgraph/hedera-wallet-connect";
import {
  createFloraTopics,
  sendFloraCreateRequest,
  announceFloraOnCommunicationTopic,
  sendFloraJoinAccept,
  sendFloraCreated,
  type FloraTopics,
  type FloraCreateRequestPayload,
} from "@/lib/hedera/flora";
import type { RegistryProfile } from "@/lib/hedera/registry";
import { readAccountData, writeAccountData, storageNamespaces } from "@/lib/storage";
import { useIdentity } from "@/providers/identity-provider";

export type FloraMember = {
  accountId: string;
  alias?: string;
  inboundTopicId?: string;
  status: "self" | "invited" | "accepted";
};

export type FloraRecord = {
  id: string;
  name: string;
  topics: FloraTopics;
  members: FloraMember[];
  status: "pending" | "active";
  createdAt: string;
  initiatorAccountId: string;
};

export type FloraInvite = {
  id: string;
  flora: FloraRecord;
  invitation: FloraCreateRequestPayload;
  receivedAt: string;
};

export type FloraPreference = {
  muted: boolean;
};

type FloraState = {
  floras: FloraRecord[];
  invites: FloraInvite[];
  preferences: Record<string, FloraPreference>;
};

type FloraAction =
  | { type: "setFloras"; floras: FloraRecord[] }
  | { type: "setInvites"; invites: FloraInvite[] }
  | { type: "setPreferences"; preferences: Record<string, FloraPreference> };

const initialState: FloraState = {
  floras: [],
  invites: [],
  preferences: {},
};

const FloraContext = createContext<{
  floras: FloraRecord[];
  invites: FloraInvite[];
  preferences: Record<string, FloraPreference>;
  createFlora: (
    name: string,
    invitees: RegistryProfile[],
    signer: DAppSigner,
    initiatorAlias?: string,
  ) => Promise<FloraRecord>;
  ingestFloraInvite: (message: FloraCreateRequestPayload) => void;
  acceptInvite: (inviteId: string, signer: DAppSigner) => Promise<void>;
  declineInvite: (inviteId: string) => void;
  toggleMute: (floraId: string) => void;
  isMuted: (floraId: string) => boolean;
} | undefined>(undefined);

function floraReducer(state: FloraState, action: FloraAction): FloraState {
  switch (action.type) {
    case "setFloras":
      return { ...state, floras: action.floras };
    case "setInvites":
      return { ...state, invites: action.invites };
    case "setPreferences":
      return { ...state, preferences: action.preferences };
    default:
      return state;
  }
}

export function FloraProvider({ children }: { children: ReactNode }) {
  const { activeIdentity } = useIdentity();
  const [state, dispatch] = useReducer(floraReducer, initialState);
  const activeAccountId = activeIdentity?.accountId ?? null;

  useEffect(() => {
    if (!activeAccountId) {
      dispatch({ type: "setFloras", floras: [] });
      dispatch({ type: "setInvites", invites: [] });
      return;
    }

    const storedFloras = readAccountData<FloraRecord[]>(
      storageNamespaces.floras,
      activeAccountId,
      [],
    );
    const storedInvites = readAccountData<FloraInvite[]>(
      storageNamespaces.floraInvites,
      activeAccountId,
      [],
    );
    const storedPrefs = readAccountData<Record<string, FloraPreference>>(
      storageNamespaces.floraPrefs,
      activeAccountId,
      {},
    );

    dispatch({
      type: "setFloras",
      floras: storedFloras,
    });
    dispatch({
      type: "setInvites",
      invites: storedInvites,
    });
    dispatch({
      type: "setPreferences",
      preferences: storedPrefs,
    });
  }, [activeAccountId]);

  const persistFloras = useCallback(
    (accountId: string, floras: FloraRecord[]) =>
      writeAccountData(storageNamespaces.floras, accountId, floras, {
        ttlMs: 12 * 60 * 60 * 1000,
      }),
    [],
  );

  const persistInvites = useCallback(
    (accountId: string, invites: FloraInvite[]) =>
      writeAccountData(storageNamespaces.floraInvites, accountId, invites, {
        ttlMs: 6 * 60 * 60 * 1000,
      }),
    [],
  );

  const persistPreferences = useCallback(
    (accountId: string, preferences: Record<string, FloraPreference>) =>
      writeAccountData(storageNamespaces.floraPrefs, accountId, preferences, {
        ttlMs: 24 * 60 * 60 * 1000,
      }),
    [],
  );

  const createFlora = useCallback(
    async (
      name: string,
      invitees: RegistryProfile[],
      signer: DAppSigner,
      initiatorAlias?: string,
    ) => {
      if (!activeAccountId) {
        throw new Error("Connect an identity before creating a flora");
      }

      const topics = await createFloraTopics(signer, name);

      const members: FloraMember[] = [
        {
          accountId: activeAccountId,
          alias: initiatorAlias,
          status: "self",
        },
        ...invitees.map<FloraMember>((invitee) => ({
          accountId: invitee.accountId,
          alias: invitee.alias,
          inboundTopicId: invitee.inboundTopicId,
          status: "invited",
        })),
      ];

      const floraRecord: FloraRecord = {
        id: topics.communication,
        name,
        topics,
        members,
        status: "pending",
        createdAt: new Date().toISOString(),
        initiatorAccountId: activeAccountId,
      };

      const payload: FloraCreateRequestPayload = {
        type: "flora_create_request",
        from: activeAccountId,
        to: "*",
        content: "Flora creation request",
        sentAt: new Date().toISOString(),
        flora: {
          name,
          communicationTopicId: topics.communication,
          transactionTopicId: topics.transaction,
          stateTopicId: topics.state,
          initiator: {
            accountId: activeAccountId,
            alias: initiatorAlias,
          },
          members: invitees.map((invitee) => ({
            accountId: invitee.accountId,
            alias: invitee.alias,
          })),
        },
      };

      await Promise.all(
        invitees
          .filter((invitee) => invitee.inboundTopicId)
          .map((invitee) =>
            sendFloraCreateRequest(signer, invitee.inboundTopicId!, {
              ...payload,
              to: invitee.accountId,
            }),
          ),
      );

      await announceFloraOnCommunicationTopic(signer, topics.communication, payload);

      const updatedFloras = [...state.floras.filter((flora) => flora.id !== floraRecord.id), floraRecord];
      dispatch({ type: "setFloras", floras: updatedFloras });
      persistFloras(activeAccountId, updatedFloras);

      return floraRecord;
    },
    [activeAccountId, persistFloras, state.floras],
  );

  const ingestFloraInvite = useCallback(
    (message: FloraCreateRequestPayload) => {
      if (!activeAccountId) {
        return;
      }

      const floraRecord: FloraRecord = {
        id: message.flora.communicationTopicId,
        name: message.flora.name,
        topics: {
          communication: message.flora.communicationTopicId,
          transaction: message.flora.transactionTopicId,
          state: message.flora.stateTopicId,
        },
        members: message.flora.members.map((member) => ({
          accountId: member.accountId,
          alias: member.alias,
          status: member.accountId === activeAccountId ? "invited" : "invited",
        })),
        status: "pending",
        createdAt: message.sentAt,
        initiatorAccountId: message.flora.initiator.accountId,
      };

      const invite: FloraInvite = {
        id: `${message.flora.communicationTopicId}:${activeAccountId}`,
        flora: floraRecord,
        invitation: message,
        receivedAt: new Date().toISOString(),
      };

      const updatedInvites = [
        ...state.invites.filter((item) => item.id !== invite.id),
        invite,
      ];
      dispatch({ type: "setInvites", invites: updatedInvites });
      persistInvites(activeAccountId, updatedInvites);
    },
    [activeAccountId, persistInvites, state.invites],
  );

  const acceptInvite = useCallback(
    async (inviteId: string, signer: DAppSigner) => {
      if (!activeAccountId) {
        throw new Error("Connect an identity before accepting invites");
      }

      const invite = state.invites.find((item) => item.id === inviteId);
      if (!invite) {
        throw new Error("Invite not found");
      }

      await sendFloraJoinAccept(signer, invite.flora.topics.communication, {
        type: "flora_join_accept",
        from: activeAccountId,
        to: invite.flora.initiatorAccountId,
        content: "Flora invitation accepted",
        sentAt: new Date().toISOString(),
        floraId: invite.flora.id,
      });

      await sendFloraCreated(signer, invite.flora.topics.communication, {
        type: "flora_created",
        from: activeAccountId,
        to: "*",
        content: "Flora coordination established",
        sentAt: new Date().toISOString(),
        floraId: invite.flora.id,
      });

      const updatedInvites = state.invites.filter((item) => item.id !== inviteId);
      dispatch({ type: "setInvites", invites: updatedInvites });
      persistInvites(activeAccountId, updatedInvites);

      const updatedMembers: FloraMember[] = invite.flora.members.map((member) =>
        member.accountId === activeAccountId
          ? { ...member, status: "accepted" }
          : member,
      );

      const updatedFlora: FloraRecord = {
        ...invite.flora,
        status: "active",
        members: updatedMembers,
      };

      const updatedFloras = [...state.floras, updatedFlora];
      dispatch({ type: "setFloras", floras: updatedFloras });
      persistFloras(activeAccountId, updatedFloras);
    },
    [activeAccountId, state.invites, state.floras, persistInvites, persistFloras],
  );

  const declineInvite = useCallback(
    (inviteId: string) => {
      if (!activeAccountId) {
        return;
      }
      const updatedInvites = state.invites.filter((item) => item.id !== inviteId);
      dispatch({ type: "setInvites", invites: updatedInvites });
      persistInvites(activeAccountId, updatedInvites);
    },
    [activeAccountId, persistInvites, state.invites],
  );

  const toggleMute = useCallback(
    (floraId: string) => {
      if (!activeAccountId) {
        return;
      }
      const current = state.preferences[floraId] ?? { muted: false };
      const updated = {
        ...state.preferences,
        [floraId]: { muted: !current.muted },
      };
      dispatch({ type: "setPreferences", preferences: updated });
      persistPreferences(activeAccountId, updated);
    },
    [activeAccountId, persistPreferences, state.preferences],
  );

  const isMuted = useCallback(
    (floraId: string) => state.preferences[floraId]?.muted ?? false,
    [state.preferences],
  );

  const value = useMemo(
    () => ({
      floras: state.floras,
      invites: state.invites,
      preferences: state.preferences,
      createFlora,
      ingestFloraInvite,
      acceptInvite,
      declineInvite,
      toggleMute,
      isMuted,
    }),
    [
      state.floras,
      state.invites,
      state.preferences,
      createFlora,
      ingestFloraInvite,
      acceptInvite,
      declineInvite,
      toggleMute,
      isMuted,
    ],
  );

  return <FloraContext.Provider value={value}>{children}</FloraContext.Provider>;
}

export function useFlora() {
  const context = useContext(FloraContext);
  if (!context) {
    throw new Error("useFlora must be used within a FloraProvider");
  }
  return context;
}
