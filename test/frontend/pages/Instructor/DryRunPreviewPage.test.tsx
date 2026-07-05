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
  fetchDryRunPreview,
} from "@/services/dryRunPreview";
import { renderWithRouter } from "@test/utils/renderWithRouter";

vi.mock("@/services/dryRunPreview", () => ({
  DryRunPreviewError: class DryRunPreviewError extends Error {
    name = "DryRunPreviewError";
  },
  fetchDryRunPreview: vi.fn(),
  confirmDryRunPreview: vi.fn(),
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

vi.mock("@/services/assistant", () => ({
  AssistantApiError: class AssistantApiError extends Error {
    name = "AssistantApiError";
  },
  sendAssistantMessage: vi.fn(),
}));

const mockedFetch = vi.mocked(fetchDryRunPreview);
const mockedConfirm = vi.mocked(confirmDryRunPreview);

function renderPage(initialEntry = paths.instructor.dryRunPreview) {
  return renderWithRouter(
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
    mockedFetch.mockResolvedValue(mockStudentReminderPreview);
    mockedConfirm.mockResolvedValue({
      success: true,
      message: "Workflow approved. Canvas actions will be executed shortly.",
    });
  });

  it("loads and displays the workflow preview", async () => {
    renderPage();

    expect(screen.getByText("Loading workflow preview...")).toBeInTheDocument();

    expect(
      await screen.findByRole("heading", { name: "Workflow Preview" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Original Request")).toBeInTheDocument();
    expect(screen.getByText("Programming Assignment 3: Loops")).toBeInTheDocument();
  });

  it("shows an error state when preview loading fails", async () => {
    mockedFetch.mockRejectedValue(new Error("Unable to load the workflow preview."));

    renderPage(`${paths.instructor.dryRunPreview}?preview=error`);

    expect(
      await screen.findByRole("heading", { name: "Unable to Load Preview" }),
    ).toBeInTheDocument();
  });

  it("returns to the assistant when reject is clicked", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /Reject/ }));

    expect(await screen.findByText("AI Assistant")).toBeInTheDocument();
  });

  it("returns to the assistant with the original request when modify is clicked", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /Modify Request/ }));

    expect(await screen.findByText("AI Assistant")).toBeInTheDocument();
    expect(
      await screen.findByText(mockStudentReminderPreview.originalRequest),
    ).toBeInTheDocument();
  });

  it("keeps the success screen visible after the toast auto-dismisses", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Approve & Execute/ }),
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Workflow Approved" })).toBeInTheDocument();
    });

    await vi.advanceTimersByTimeAsync(4000);

    expect(screen.getByRole("heading", { name: "Workflow Approved" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Workflow Preview" }),
    ).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("shows success after approving the workflow", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: /Approve & Execute/ }),
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Workflow Approved" })).toBeInTheDocument();
    });
    expect(mockedConfirm).toHaveBeenCalledWith(mockStudentReminderPreview.id);
  });
});
