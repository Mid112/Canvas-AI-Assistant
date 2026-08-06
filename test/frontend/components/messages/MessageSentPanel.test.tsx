import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MessageSentPanel } from "@/components/messages/MessageSentPanel";
import * as messageDraft from "@/services/messageDraft";
import type { SentMessageDraft } from "@/types/messageDraft";

const mockUseAuth = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/services/messageDraft", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/messageDraft")>();
  return {
    ...actual,
    fetchSentMessageDrafts: vi.fn(),
  };
});

const sentItems: SentMessageDraft[] = [
  {
    id: "1",
    courseId: 10,
    subject: "Lab reminder",
    body: "Please submit your lab write-up.",
    recipients: [{ id: "101", name: "Ada Lovelace", email: "ada@example.com" }],
    status: "sent",
    sentAt: "2026-01-03T18:00:00Z",
    deliveryMode: "conversation",
    createdAt: "2026-01-03T17:00:00Z",
    updatedAt: "2026-01-03T18:00:00Z",
  },
  {
    id: "2",
    courseId: 10,
    subject: "Syllabus update",
    body: "Office hours moved to Thursday.",
    recipients: [],
    status: "sent",
    sentAt: "2026-01-02T12:00:00Z",
    deliveryMode: "announcement",
    createdAt: "2026-01-02T11:00:00Z",
    updatedAt: "2026-01-02T12:00:00Z",
  },
];

describe("MessageSentPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      accessToken: "token",
      user: { id: 1, has_canvas_token: true },
      isAuthenticated: true,
      isLoading: false,
    });
    vi.mocked(messageDraft.fetchSentMessageDrafts).mockResolvedValue(sentItems);
  });

  // Verifies: Sent list shows subjects and announcement vs direct badges.
  it("lists sent messages with delivery mode badges", async () => {
    render(
      <MessageSentPanel
        courseId={10}
        courseLabel="COSC 499"
        courseNameById={{ 10: "COSC 499" }}
      />,
    );

    expect(await screen.findByText("Lab reminder")).toBeInTheDocument();
    expect(screen.getByText("Syllabus update")).toBeInTheDocument();
    expect(screen.getByText("Direct")).toBeInTheDocument();
    expect(screen.getByText("Announcement")).toBeInTheDocument();
    expect(messageDraft.fetchSentMessageDrafts).toHaveBeenCalledWith("token", {
      courseId: 10,
    });
  });

  // Verifies: Empty Sent state mentions the course label.
  it("shows an empty state for the active course", async () => {
    vi.mocked(messageDraft.fetchSentMessageDrafts).mockResolvedValue([]);

    render(<MessageSentPanel courseId={10} courseLabel="Baking 101" />);

    expect(
      await screen.findByText("No sent messages for Baking 101 yet."),
    ).toBeInTheDocument();
  });
});
