import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TroubleshootingPage } from "@/pages/Admin/TroubleshootingPage";
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

function failedOperation(id: number, overrides: Partial<troubleshootService.FailedOperation> = {}) {
  return {
    id,
    action_name: "create_assignment",
    user_name: "Jane Doe",
    user_email: "jane@example.com",
    course_name: "CPSC 310",
    error_detail: "Canvas server error: 503",
    created_at: "2026-07-21T18:00:00Z",
    executed_at: null,
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
    vi.spyOn(troubleshootService, "fetchFailedOperations").mockResolvedValue({
      items: [failedOperation(1)],
      total: 1,
    });
  });

  it("renders the diagnostics overview", async () => {
    renderWithRouter(<TroubleshootingPage />);

    await waitFor(() => {
      expect(screen.getByText("Overall health")).toBeInTheDocument();
    });

    expect(screen.getByText("degraded")).toBeInTheDocument();
    expect(screen.getByText("https://canvas.ubc.ca")).toBeInTheDocument();
    expect(screen.getByText("3 min")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
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

  it("renders failed operations in a table", async () => {
    renderWithRouter(<TroubleshootingPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed operations")).toBeInTheDocument();
    });

    expect(screen.getByText("create_assignment")).toBeInTheDocument();
    expect(screen.getByText("CPSC 310")).toBeInTheDocument();
    expect(screen.getByText("Canvas server error: 503")).toBeInTheDocument();
  });

  it("shows a clean state when there are no failed operations", async () => {
    vi.spyOn(troubleshootService, "fetchFailedOperations").mockResolvedValue({
      items: [],
      total: 0,
    });

    renderWithRouter(<TroubleshootingPage />);

    await waitFor(() => {
      expect(screen.getByText("No failed operations recorded.")).toBeInTheDocument();
    });
  });

  it("loads more failed operations when Load more is clicked", async () => {
    vi.spyOn(troubleshootService, "fetchFailedOperations").mockResolvedValueOnce({
      items: [failedOperation(1)],
      total: 2,
    });

    renderWithRouter(<TroubleshootingPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
    });

    vi.spyOn(troubleshootService, "fetchFailedOperations").mockResolvedValueOnce({
      items: [failedOperation(2, { action_name: "update_grade", course_name: "CPSC 210" })],
      total: 2,
    });

    await user.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => {
      expect(screen.getByText("update_grade")).toBeInTheDocument();
    });
    expect(troubleshootService.fetchFailedOperations).toHaveBeenLastCalledWith(
      "access-token",
      { limit: 50, offset: 1 },
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
      expect(troubleshootService.fetchFailedOperations).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "Refresh diagnostics" }));

    await waitFor(() => {
      expect(troubleshootService.fetchDiagnostics).toHaveBeenCalledTimes(2);
      expect(troubleshootService.fetchFailedOperations).toHaveBeenCalledTimes(2);
    });
  });
});
