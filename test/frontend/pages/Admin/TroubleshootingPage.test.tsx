import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TroubleshootingPage } from "@/pages/Admin/TroubleshootingPage";
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
  canvas_api_url: "https://canvas.ubc.ca",
  backend_uptime_seconds: 185,
  health: { overall_status: "degraded", checked_at: "2026-07-21T18:00:00Z", services: {} },
  instructor_canvas: {
    total: 4,
    healthy: 3,
    failing: 1,
    failing_connections: [
      {
        user_name: "Jane Doe",
        user_email: "jane@example.com",
        canvas_url: "https://canvas.example.edu",
        error_detail: "401 Unauthorized",
      },
    ],
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

function failedOp(
  id: number,
  overrides: Partial<failedOperationsService.FailedOperation> = {},
): failedOperationsService.FailedOperation {
  return {
    id,
    source: "canvas",
    operation: "create_assignment",
    user_id: 10,
    user_name: "Jane Doe",
    course_id: 5,
    conversation_id: 20,
    workflow_id: null,
    tool_call_id: null,
    provider: null,
    error_detail: "Canvas server error: 503",
    context_json: {},
    created_at: "2026-07-21T18:00:00Z",
    ...overrides,
  };
}

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
    vi.spyOn(failedOperationsService, "fetchFailedOperations").mockResolvedValue({
      items: [failedOp(1)],
      total: 1,
      canvas_count: 1,
      ai_count: 0,
    });
    vi.spyOn(failedOperationsService, "fetchFailedOperation").mockImplementation(
      async (_token, id) => failedOp(id),
    );
  });

  it("renders the diagnostics overview", async () => {
    renderWithRouter(<TroubleshootingPage />);

    await waitFor(() => {
      expect(screen.getByText("Overall health")).toBeInTheDocument();
    });

    expect(screen.getByText("degraded")).toBeInTheDocument();
    expect(screen.getByText("https://canvas.ubc.ca")).toBeInTheDocument();
    expect(screen.getByText("3 min")).toBeInTheDocument();
  });

  it("renders the instructor Canvas connections summary without exposing tokens", async () => {
    renderWithRouter(<TroubleshootingPage />);

    await waitFor(() => {
      expect(screen.getByText("Instructor Canvas connections")).toBeInTheDocument();
    });

    expect(
      screen.getByText("Jane Doe (jane@example.com) — 401 Unauthorized"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/token/i, { selector: "code, pre" })).not.toBeInTheDocument();
  });

  it("renders LLM provider statuses", async () => {
    renderWithRouter(<TroubleshootingPage />);

    await waitFor(() => {
      expect(screen.getByText("LLM providers")).toBeInTheDocument();
    });

    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  it("renders failed-operation summary cards (Canvas + AI, Feature 11)", async () => {
    renderWithRouter(<TroubleshootingPage />);

    await waitFor(() => {
      expect(screen.getByText("Total failures")).toBeInTheDocument();
    });

    expect(screen.getByText("Canvas failures")).toBeInTheDocument();
    expect(screen.getByText("AI failures")).toBeInTheDocument();
  });

  it("renders failed operations in a list with a detail panel", async () => {
    renderWithRouter(<TroubleshootingPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed operations")).toBeInTheDocument();
    });

    expect(screen.getByText("create_assignment")).toBeInTheDocument();
    expect(screen.getAllByText("Canvas server error: 503").length).toBeGreaterThan(0);
  });

  it("filters the failed-operations list when a source tab is selected", async () => {
    renderWithRouter(<TroubleshootingPage />);

    await waitFor(() => {
      expect(screen.getByText("create_assignment")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "AI" }));

    await waitFor(() => {
      expect(failedOperationsService.fetchFailedOperations).toHaveBeenLastCalledWith(
        "access-token",
        expect.objectContaining({ source: "ai" }),
      );
    });
  });

  it("loads detail context when a list item is selected", async () => {
    vi.spyOn(failedOperationsService, "fetchFailedOperations").mockResolvedValue({
      items: [failedOp(1), failedOp(2, { operation: "assistant_chat", source: "ai", provider: "openai" })],
      total: 2,
      canvas_count: 1,
      ai_count: 1,
    });

    renderWithRouter(<TroubleshootingPage />);

    await waitFor(() => {
      expect(screen.getByText("assistant_chat")).toBeInTheDocument();
    });

    await user.click(screen.getByText("assistant_chat"));

    await waitFor(() => {
      expect(failedOperationsService.fetchFailedOperation).toHaveBeenLastCalledWith(
        "access-token",
        2,
      );
    });
  });

  it("shows a clean state when there are no failed operations", async () => {
    vi.spyOn(failedOperationsService, "fetchFailedOperations").mockResolvedValue({
      items: [],
      total: 0,
      canvas_count: 0,
      ai_count: 0,
    });

    renderWithRouter(<TroubleshootingPage />);

    await waitFor(() => {
      expect(screen.getByText("No failed operations recorded.")).toBeInTheDocument();
    });
    expect(screen.getByText("Select a failed operation to view details.")).toBeInTheDocument();
  });

  it("loads more failed operations when Load more is clicked", async () => {
    vi.spyOn(failedOperationsService, "fetchFailedOperations").mockResolvedValueOnce({
      items: [failedOp(1)],
      total: 2,
      canvas_count: 2,
      ai_count: 0,
    });

    renderWithRouter(<TroubleshootingPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
    });

    vi.spyOn(failedOperationsService, "fetchFailedOperations").mockResolvedValueOnce({
      items: [failedOp(2, { operation: "update_grade" })],
      total: 2,
      canvas_count: 2,
      ai_count: 0,
    });

    await user.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => {
      expect(screen.getByText("update_grade")).toBeInTheDocument();
    });
    expect(failedOperationsService.fetchFailedOperations).toHaveBeenLastCalledWith(
      "access-token",
      { source: undefined, limit: 50, offset: 1 },
    );
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
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

  it("refetches diagnostics and failed operations when refresh is clicked", async () => {
    renderWithRouter(<TroubleshootingPage />);

    await waitFor(() => {
      expect(troubleshootService.fetchDiagnostics).toHaveBeenCalledTimes(1);
      expect(failedOperationsService.fetchFailedOperations).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "Refresh diagnostics" }));

    await waitFor(() => {
      expect(troubleshootService.fetchDiagnostics).toHaveBeenCalledTimes(2);
      expect(failedOperationsService.fetchFailedOperations).toHaveBeenCalledTimes(2);
    });
  });
});
