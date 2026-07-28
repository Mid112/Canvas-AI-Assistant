import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { StudentMessageDraftPage } from "@/pages/StudentMessageDraftPage";
import { fetchMessageDraft, sendMessageDraft } from "@/services/messageDraft";
import { emptyRecipientsMessageDraft, mockMessageDraft } from "@/data/mockMessageDraft";
import { renderWithRouter } from "@test/utils/renderWithRouter";

vi.mock("@/services/messageDraft", () => ({
  MessageDraftApiError: class MessageDraftApiError extends Error {
    name = "MessageDraftApiError";
  },
  isMessageDraftSendMocked: false,
  fetchMessageDraft: vi.fn(),
  sendMessageDraft: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: () => ({
      accessToken: "access-token",
      user: { name: "Dr. Jane Doe", role: "instructor" },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    }),
  };
});

const mockedFetch = vi.mocked(fetchMessageDraft);
const mockedSend = vi.mocked(sendMessageDraft);

function renderPage(initialEntry = "/instructor/messages") {
  return renderWithRouter(
    <Routes>
      <Route path="/instructor/messages" element={<StudentMessageDraftPage />} />
    </Routes>,
    {
      routerProps: {
        initialEntries: [initialEntry],
      },
    },
  );
}

describe("StudentMessageDraftPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedFetch.mockResolvedValue({
      ...mockMessageDraft,
      recipients: [...mockMessageDraft.recipients],
    });
    mockedSend.mockResolvedValue();
  });

  // Verifies: Loads and displays the mock message draft.
  it("loads and displays the mock message draft", async () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "AI Message Drafting" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Loading message draft...")).toBeInTheDocument();

    // Empty recipient selection is now the course-wide announcement path, so the
    // page applies the announcement preset instead of the old private-message
    // reminder default.
    expect(await screen.findByLabelText("Subject")).toHaveValue("Course Announcement");
    expect(screen.getByLabelText("Message body")).toHaveValue(
      "Share an important update with your class.",
    );
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("Course announcement selected")).toBeInTheDocument();
    expect(screen.getByText("Assignment Reminder")).toBeInTheDocument();
  });

  // Verifies: Updates preview when subject and body are edited.
  it("updates preview when subject and body are edited", async () => {
    const user = userEvent.setup();
    renderPage();

    const subjectField = await screen.findByLabelText("Subject");
    await user.clear(subjectField);
    await user.type(subjectField, "Updated subject line");

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Updated subject line")).toBeInTheDocument();
  });

  // Verifies: Shows confirmation dialog and sends message on confirm.
  it("shows confirmation dialog and sends message on confirm", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText("Subject");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent("Send Message?");
    await user.click(screen.getByRole("button", { name: "Confirm Send" }));

    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith("access-token", {
        draftId: mockMessageDraft.id,
        // No recipients means send as a course announcement, not as private
        // messages to every student.
        subject: "Course Announcement",
        body: "Share an important update with your class.",
        recipientIds: [],
        recipients: [],
        conversationId: undefined,
      });
    });

    expect(await screen.findByText("Message Sent")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Course announcement posted successfully.",
    );
  });

  // Verifies: Shows an error notification when sending fails.
  it("shows an error notification when sending fails", async () => {
    const user = userEvent.setup();
    mockedSend.mockRejectedValueOnce(
      new Error("Unable to send message. Canvas messaging is temporarily unavailable."),
    );

    renderPage();

    await screen.findByLabelText("Subject");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.click(await screen.findByRole("button", { name: "Confirm Send" }));

    expect(
      await screen.findByText(
        "Unable to send message. Canvas messaging is temporarily unavailable.",
      ),
    ).toBeInTheDocument();
  });

  // Verifies: Sends only the selected student.
  it("sends only the selected student", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByLabelText("Subject");
    await user.click(screen.getByRole("checkbox", { name: /John Smith/i }));

    expect(screen.getByText("1 student selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("1 student");
    await user.click(screen.getByRole("button", { name: "Confirm Send" }));

    await waitFor(() => {
      expect(mockedSend).toHaveBeenCalledWith("access-token", {
        draftId: mockMessageDraft.id,
        subject: "Assignment Reminder: Course Update",
        body: "Remind students about the assignment, due date, and any next steps.",
        recipientIds: ["student-3"],
        recipients: [
          {
            id: "student-3",
            name: "John Smith",
            email: "john.smith@university.edu",
          },
        ],
        conversationId: undefined,
      });
    });
  });

  // Verifies: Resets edits when cancel is clicked.
  it("resets edits when cancel is clicked", async () => {
    const user = userEvent.setup();
    renderPage();

    const subjectField = await screen.findByLabelText("Subject");
    await user.clear(subjectField);
    await user.type(subjectField, "Temporary edit");

    expect(subjectField).toHaveValue("Temporary edit");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(subjectField).toHaveValue(mockMessageDraft.subject);
  });

  // Verifies: Requests empty recipients when ?empty=true.
  it("requests empty recipients when ?empty=true", async () => {
    mockedFetch.mockResolvedValueOnce({
      ...emptyRecipientsMessageDraft,
    });

    renderPage("/instructor/messages?empty=true");

    await waitFor(() => {
      expect(mockedFetch).toHaveBeenCalledWith("access-token", {
        emptyRecipients: true,
        simulateLoadError: false,
      });
    });

    // Course announcements are intentionally sendable with zero selected
    // students because Canvas handles delivery at the course scope.
    expect(await screen.findByText("Course announcement selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
  });

  // Verifies: Shows load error with retry when ?loadError=true.
  it("shows load error with retry when ?loadError=true", async () => {
    mockedFetch.mockRejectedValueOnce(
      new Error("Unable to load message draft. Please try again."),
    );

    renderPage("/instructor/messages?loadError=true");

    expect(
      await screen.findByText("Unable to load message draft. Please try again."),
    ).toBeInTheDocument();

    mockedFetch.mockResolvedValueOnce({
      ...mockMessageDraft,
      recipients: [...mockMessageDraft.recipients],
    });

    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByLabelText("Subject")).toHaveValue("Course Announcement");
  });
});
