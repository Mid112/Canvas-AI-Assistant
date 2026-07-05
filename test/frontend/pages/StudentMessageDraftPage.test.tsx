import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { StudentMessageDraftPage } from "@/pages/StudentMessageDraftPage";
import { fetchMessageDraft, sendMessageDraft } from "@/services/messageDraft";
import { mockMessageDraft } from "@/data/mockMessageDraft";
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

  it("loads and displays the mock message draft", async () => {
    renderPage();

    expect(
      screen.getByRole("heading", { name: "AI Message Drafting" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Loading message draft...")).toBeInTheDocument();

    expect(await screen.findByLabelText("Subject")).toHaveValue(mockMessageDraft.subject);
    expect(screen.getByLabelText("Message body")).toHaveValue(mockMessageDraft.body);
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("5 students selected")).toBeInTheDocument();
    expect(screen.getByText("Assignment Reminder")).toBeInTheDocument();
  });

  it("updates preview when subject and body are edited", async () => {
    const user = userEvent.setup();
    renderPage();

    const subjectField = await screen.findByLabelText("Subject");
    await user.clear(subjectField);
    await user.type(subjectField, "Updated subject line");

    await user.click(screen.getByRole("button", { name: "Preview" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Updated subject line")).toBeInTheDocument();
  });

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
        subject: mockMessageDraft.subject,
        body: mockMessageDraft.body,
        recipientIds: mockMessageDraft.recipients.map((recipient) => recipient.id),
      });
    });

    expect(await screen.findByText("Message Sent")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Message sent successfully to 5 students.",
    );
  });

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

  it("requests empty recipients when ?empty=true", async () => {
    mockedFetch.mockResolvedValueOnce({
      ...mockMessageDraft,
      recipients: [],
    });

    renderPage("/instructor/messages?empty=true");

    await waitFor(() => {
      expect(mockedFetch).toHaveBeenCalledWith("access-token", {
        emptyRecipients: true,
        simulateLoadError: false,
      });
    });

    expect(await screen.findByText("0 students selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

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

    expect(await screen.findByLabelText("Subject")).toHaveValue(mockMessageDraft.subject);
  });
});
