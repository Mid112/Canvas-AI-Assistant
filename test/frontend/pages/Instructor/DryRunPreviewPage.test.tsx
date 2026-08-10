import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { DryRunPreviewPage } from "@/pages/Instructor/DryRunPreviewPage";
import { InstructorAssistantPage } from "@/pages/Instructor/InstructorAssistantPage";
import { mockStudentReminderPreview } from "@/data/mockDryRunPreview";
import { paths } from "@/routes/paths";
import {
  confirmDryRunPreview,
  DryRunPreviewError,
  fetchChatIntentPreview,
  fetchDryRunPreview,
} from "@/services/dryRunPreview";
import {
  AssistantApiError,
  modifyAssistantAction,
} from "@/services/assistant";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

vi.mock("@/services/dryRunPreview", () => ({
  DryRunPreviewError: class DryRunPreviewError extends Error {
    name = "DryRunPreviewError";
  },
  fetchDryRunPreview: vi.fn(),
  fetchChatIntentPreview: vi.fn(),
  confirmDryRunPreview: vi.fn(),
}));

vi.mock("@/services/assistant", () => ({
  AssistantApiError: class AssistantApiError extends Error {
    name = "AssistantApiError";
  },
  cancelAssistantAction: vi.fn(),
  confirmAssistantAction: vi.fn(),
  modifyAssistantAction: vi.fn(),
  sendAssistantMessage: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchDryRunPreview);
const mockedFetchChatPreview = vi.mocked(fetchChatIntentPreview);
const mockedConfirm = vi.mocked(confirmDryRunPreview);
const mockedModify = vi.mocked(modifyAssistantAction);
const mockUseAuth = vi.fn();

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

function renderPage(initialEntry = paths.instructor.dryRunPreview) {
  return renderWithInstitution(
    <Routes>
      <Route path={paths.instructor.dryRunPreview} element={<DryRunPreviewPage />} />
      <Route path={paths.instructor.assistant} element={<InstructorAssistantPage />} />
    </Routes>,
    {
      routerProps: {
        initialEntries: [initialEntry],
      },
    },
  );
}

describe("DryRunPreviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: {
        id: 1,
        email: "jane.doe@example.com",
        name: "Dr. Jane Doe",
        role: "instructor",
        is_active: true,
        has_canvas_token: true,
        canvas_connections: [
          {
            id: 1,
            canvas_url: "https://canvas.example.edu",
            created_at: "2026-06-26T00:00:00.000Z",
          },
        ],
      },
      accessToken: "token",
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
    mockedFetch.mockResolvedValue(mockStudentReminderPreview);
    mockedConfirm.mockRejectedValue(
      new DryRunPreviewError(
        "This demo preview cannot execute Canvas actions. Approve a preview from the assistant chat instead.",
      ),
    );
  });

  // Verifies: Loads and displays the workflow preview.
  it("loads and displays the workflow preview", async () => {
    renderPage();

    expect(screen.getByText("Loading workflow preview...")).toBeInTheDocument();

    expect(
      await screen.findByRole("heading", { name: "Workflow Preview" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Original Request")).toBeInTheDocument();
    expect(screen.getByText("Programming Assignment 3: Loops")).toBeInTheDocument();
  });

  // Verifies: Shows an error state when preview loading fails.
  it("shows an error state when preview loading fails", async () => {
    mockedFetch.mockRejectedValue(new Error("Unable to load the workflow preview."));

    renderPage(`${paths.instructor.dryRunPreview}?preview=error`);

    expect(
      await screen.findByRole("heading", { name: "Unable to Load Preview" }),
    ).toBeInTheDocument();
  });

  // Verifies: Returns to the assistant when reject is clicked.
  it("returns to the assistant when reject is clicked", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /Reject/ }));

    expect(
      await screen.findByRole("textbox", { name: "Chat message" }),
    ).toBeInTheDocument();
  });

  // Verifies: Returns to the assistant with the original request prefilled when modify is clicked.
  it("returns to the assistant with the original request prefilled when modify is clicked", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /Modify Request/ }));

    expect(await screen.findByRole("textbox", { name: "Chat message" })).toHaveValue(
      mockStudentReminderPreview.originalRequest,
    );
  });

  // Verifies: Ticket 38 — mock Approve shows an error instead of fake Canvas success.
  it("shows an error when approving a mock demo preview", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Approve & Execute/ }),
    );

    expect(
      await screen.findByText(/cannot execute Canvas actions/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Workflow Approved" }),
    ).not.toBeInTheDocument();
    expect(mockedConfirm).toHaveBeenCalledWith(mockStudentReminderPreview.id);
  });

  it("shows backend validation errors when chat preview edits fail to regenerate", async () => {
    const user = userEvent.setup();
    mockedFetchChatPreview.mockResolvedValue({
      ...mockStudentReminderPreview,
      proposedPlan: [
        {
          field: "title",
          label: "Title",
          value: "Midterm",
          rawValue: "Midterm",
          editable: true,
        },
      ],
    });
    mockedModify.mockRejectedValue(
      new AssistantApiError("Due date must be in the future."),
    );

    renderPage(
      `${paths.instructor.dryRunPreview}?conversation=7&pending=42`,
    );

    await user.click(
      await screen.findByRole("button", { name: "Save & regenerate preview" }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Due date must be in the future.");
    expect(
      screen.queryByRole("button", { name: /Approve & Execute/ }),
    ).toBeInTheDocument();
  });
});
