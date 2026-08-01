import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { adminInstructorsFailingCanvasPath, paths } from "@/routes/paths";
import { TroubleshootingPage } from "@/pages/Admin/TroubleshootingPage";
import * as adminCanvasConnectionsService from "@/services/adminCanvasConnections";
import * as failedOperationsService from "@/services/failedOperations";
import * as troubleshootService from "@/services/troubleshoot";
import { renderWithRouter } from "@test/utils/renderWithRouter";

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

const diagnosticsResponse: troubleshootService.DiagnosticsResponse = {
  canvas_api_url: "https://canvas.example.edu",
  backend_uptime_seconds: 185,
  health: { overall_status: "degraded", checked_at: "2026-07-21T18:00:00Z", services: {} },
  instructor_canvas: {
    total: 4,
    healthy: 3,
    failing: 1,
  },
  llm_providers: [
    {
      id: "openai",
      name: "OpenAI",
      hosting: "internet",
      default_model: "gpt-4",
      configured: true,
      status: "available",
      models: [],
      detail: null,
    },
  ],
  recent_failed_operations_count: 3,
};

const summary: failedOperationsService.FailedOperationSummaryResponse = {
  total: 3,
  canvas_count: 2,
  ai_count: 1,
  hours: 24,
};

const failingConnections: troubleshootService.FailingCanvasConnectionListResponse = {
  items: [
    {
      user_id: 42,
      user_name: "Jane Doe",
      user_email: "jane@example.com",
      canvas_url: "https://canvas.example.edu",
      human_summary: "Canvas isn't responding for this instructor right now.",
      error_detail: "401 Unauthorized",
      needs_token_reset: false,
    },
  ],
  total: 1,
};

const tokenIssueConnections: troubleshootService.FailingCanvasConnectionListResponse = {
  items: [
    {
      user_id: 42,
      user_name: "Jane Doe",
      user_email: "jane@example.com",
      canvas_url: "https://canvas.example.edu",
      human_summary:
        "This instructor needs to reconnect their Canvas account — ask them to reconnect in Settings, or reset their token below.",
      error_detail: "No Canvas token for https://canvas.example.edu.",
      needs_token_reset: true,
    },
  ],
  total: 1,
};

describe("TroubleshootingPage", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      accessToken: "access-token",
      user: { email: "admin@system.local", role: "admin" },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
    vi.spyOn(troubleshootService, "fetchDiagnostics").mockResolvedValue(diagnosticsResponse);
    vi.spyOn(failedOperationsService, "fetchFailedOperationsSummary").mockResolvedValue(summary);
    vi.spyOn(troubleshootService, "fetchFailingCanvasConnections").mockResolvedValue(
      failingConnections,
    );
    vi.spyOn(adminCanvasConnectionsService, "resetInstructorCanvasToken");
  });

  it("renders the diagnostics overview", async () => {
    renderWithRouter(<TroubleshootingPage />);

    await waitFor(() => {
      expect(screen.getByText("Overall health")).toBeInTheDocument();
    });

    expect(screen.getByText("Degraded")).toBeInTheDocument();
    expect(screen.getByText("https://canvas.example.edu")).toBeInTheDocument();
    expect(screen.getByText("3 min")).toBeInTheDocument();
  });

  it("renders the instructor Canvas connections summary without exposing tokens", async () => {
    renderWithRouter(<TroubleshootingPage />);

    await waitFor(() => {
      expect(screen.getByText("Instructor Canvas connections")).toBeInTheDocument();
    });

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText(/jane@example\.com/)).toBeInTheDocument();
    expect(
      screen.getByText("Canvas isn't responding for this instructor right now."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/token/i, { selector: "code, pre" })).not.toBeInTheDocument();
  });

  // Verifies AC3 (admin-only instructions appear only when actually
  // required): a transient "Canvas isn't responding" outage isn't fixable
  // by a token reset, so the admin-only "Reset token" action shouldn't be
  // offered for it.
  it("hides the Reset token action when the failure isn't a token issue", async () => {
    renderWithRouter(<TroubleshootingPage />);

    await screen.findByText("Jane Doe");

    expect(screen.queryByRole("button", { name: "Reset token" })).not.toBeInTheDocument();
  });

  it("renders LLM provider statuses", async () => {
    renderWithRouter(<TroubleshootingPage />);

    await waitFor(() => {
      expect(screen.getByText("LLM providers")).toBeInTheDocument();
    });

    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  it("renders a compact failed-operations summary (Canvas + AI, Feature 11)", async () => {
    renderWithRouter(<TroubleshootingPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed operations")).toBeInTheDocument();
    });

    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Canvas")).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();
    // Renders as a compact summary only -- no list/filter/detail panel here.
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("links to the dedicated Failed Operations page for the full drill-down", async () => {
    renderWithRouter(<TroubleshootingPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed operations")).toBeInTheDocument();
    });

    // The Button component keeps role="button" for a11y consistency even
    // when rendered as a Link (Base UI's render prop), so query by button.
    const link = screen.getByRole("button", { name: /view failed operations/i });
    expect(link).toHaveAttribute("href", paths.admin.failedOperations);
  });

  it("shows an error state when diagnostics fail to load", async () => {
    vi.spyOn(troubleshootService, "fetchDiagnostics").mockRejectedValueOnce(
      new Error("network error"),
    );

    renderWithRouter(<TroubleshootingPage />);

    expect(
      await screen.findByText("Unable to load troubleshooting diagnostics."),
    ).toBeInTheDocument();
  });

  it("refetches diagnostics and the failed-operations summary when refresh is clicked", async () => {
    renderWithRouter(<TroubleshootingPage />);

    await waitFor(() => {
      expect(troubleshootService.fetchDiagnostics).toHaveBeenCalledTimes(1);
      expect(failedOperationsService.fetchFailedOperationsSummary).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "Refresh diagnostics" }));

    await waitFor(() => {
      expect(troubleshootService.fetchDiagnostics).toHaveBeenCalledTimes(2);
      expect(failedOperationsService.fetchFailedOperationsSummary).toHaveBeenCalledTimes(2);
    });
  });

  // Verifies: "Manage instructors" deep-links to the failing-only filtered
  // view (see routes/paths.ts::adminInstructorsFailingCanvasPath), not the
  // full instructor roster.
  it("links Manage instructors to the failing-only instructor filter", async () => {
    renderWithRouter(<TroubleshootingPage />);

    await waitFor(() => {
      expect(screen.getByText("Instructor Canvas connections")).toBeInTheDocument();
    });

    const link = screen.getByRole("button", { name: "Manage instructors" });
    expect(link).toHaveAttribute("href", adminInstructorsFailingCanvasPath());
  });

  it("paginates the failing connections list independently of the rest of diagnostics", async () => {
    vi.spyOn(troubleshootService, "fetchFailingCanvasConnections").mockImplementation(
      async (_token, options) => {
        if ((options?.offset ?? 0) === 0) {
          return { items: failingConnections.items, total: 7 };
        }
        return {
          items: [
            {
              ...failingConnections.items[0]!,
              user_id: 99,
              user_name: "Second Page Instructor",
            },
          ],
          total: 7,
        };
      },
    );

    renderWithRouter(<TroubleshootingPage />);

    await screen.findByText("Jane Doe");
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(screen.getByText("Second Page Instructor")).toBeInTheDocument();
    });
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(troubleshootService.fetchFailingCanvasConnections).toHaveBeenLastCalledWith(
      "access-token",
      { limit: 5, offset: 5 },
    );
    // Paging the connections list must not re-run the rest of diagnostics.
    expect(troubleshootService.fetchDiagnostics).toHaveBeenCalledTimes(1);
  });

  it("resets a failing connection's Canvas token directly from the card", async () => {
    vi.spyOn(troubleshootService, "fetchFailingCanvasConnections").mockResolvedValue(
      tokenIssueConnections,
    );
    vi.spyOn(adminCanvasConnectionsService, "resetInstructorCanvasToken").mockResolvedValue([]);

    renderWithRouter(<TroubleshootingPage />);

    await screen.findByText("Jane Doe");

    await user.click(screen.getByRole("button", { name: "Reset token" }));
    await user.type(screen.getByLabelText("New Canvas API token"), "fresh-token-value");
    await user.click(screen.getByRole("button", { name: "Update token" }));

    await waitFor(() => {
      expect(adminCanvasConnectionsService.resetInstructorCanvasToken).toHaveBeenCalledWith(
        "access-token",
        "42",
        { canvasUrl: "https://canvas.example.edu", canvasToken: "fresh-token-value" },
      );
    });

    // A successful reset refreshes both the diagnostics counts and this
    // card's own connections page.
    await waitFor(() => {
      expect(troubleshootService.fetchDiagnostics).toHaveBeenCalledTimes(2);
      expect(troubleshootService.fetchFailingCanvasConnections).toHaveBeenCalledTimes(2);
    });
  });
});
