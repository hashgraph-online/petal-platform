import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectMessage, InboxEvent } from "@/lib/hedera/messaging";
import { Inbox } from "@/components/messages/Inbox";
import { ToastProvider } from "@/providers/toast-provider";

const messagingModule = vi.hoisted(() => ({
  fetchInboxEvents: vi.fn(),
  subscribeInbox: vi.fn(),
}));

vi.mock("@/lib/hedera/messaging", () => messagingModule);

const storageModule = vi.hoisted(() => ({
  readAccountData: vi.fn(() => []),
  writeAccountData: vi.fn(),
  storageNamespaces: { inbox: "inbox" },
}));

vi.mock("@/lib/storage", () => storageModule);

const registryModule = vi.hoisted(() => ({
  fetchLatestProfileForAccount: vi.fn(async () => ({
    accountId: "0.0.1",
    alias: "alice",
    displayName: "Alice",
    inboundTopicId: "0.0.333",
  })),
}));

vi.mock("@/lib/hedera/registry", () => registryModule);

vi.mock("@/providers/debug-provider", () => ({
  useDebug: () => ({ debugMode: false }),
}));

vi.mock("@/config/topics", () => ({
  topicExplorerUrl: () => "#",
}));

vi.mock("@/config/env", () => ({
  isDebug: false,
}));

describe("Inbox", () => {
  const baseMessage: DirectMessage = {
    type: "text",
    from: "0.0.1",
    to: "0.0.2",
    content: "hello",
    sentAt: "2023-10-11T10:00:00Z",
    consensusTimestamp: "1697040101.000000001",
    sequenceNumber: 1,
  };

  beforeEach(() => {
    const baseEvent: InboxEvent = {
      kind: "direct-message",
      message: baseMessage,
    };
    messagingModule.fetchInboxEvents.mockResolvedValue([baseEvent]);
    messagingModule.subscribeInbox.mockReset();
    storageModule.readAccountData.mockReturnValue([]);
    storageModule.writeAccountData.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("deduplicates live messages and cleans up subscriptions", async () => {
    let liveCallback: ((event: InboxEvent) => void) | undefined;
    const unsubscribe = vi.fn();

    messagingModule.subscribeInbox.mockImplementation((_, callback) => {
      liveCallback = callback;
      return unsubscribe;
    });

    const { unmount } = render(
      <ToastProvider>
        <Inbox topicId="0.0.999" accountId="0.0.2" />
      </ToastProvider>,
    );

    await waitFor(() => expect(screen.getByText("hello")).toBeInTheDocument());

    const nextMessage: DirectMessage = {
      ...baseMessage,
      consensusTimestamp: "1697040102.000000002",
      sequenceNumber: 2,
      content: "hey there",
    };

    await act(async () => {
      liveCallback?.({ kind: "direct-message", message: nextMessage });
    });

    await waitFor(() => expect(screen.getByText("hey there")).toBeInTheDocument());
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    await act(async () => {
      liveCallback?.({ kind: "direct-message", message: { ...nextMessage } });
    });

    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});
