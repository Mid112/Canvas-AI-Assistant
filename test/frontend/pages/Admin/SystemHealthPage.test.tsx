import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SystemHealthPage } from "@/pages/Admin/SystemHealthPage";
import * as systemHealthService from "@/services/systemHealth";
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

const healthyResponse: systemHealthService.HealthCheckResponse = {
  overall_status: "healthy",
  checked_at: "2026-07-21T18:00:00Z",
  services: {
    backend: { status: "healthy", latency_ms: 1, error_detail: null, uptime_seconds: 120 },
    database: { status: "healthy", latency_ms: 8, error_detail: null, uptime_seconds: null },
    canvas: { status: "degraded", latency_ms: 4000, error_detail: null, uptime_seconds: null },
    ai: { status: "down", latency_ms: null, error_detail: "AI service timed out", uptime_seconds: null },
  },
  instructor_canvas: {
    total: 10,
    healthy: 9,
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
  instructor_ai: { total: 5, failing_recent: 2 },
};

const emptyHistoryResponse: systemHealthService.HealthHistoryResponse = {
  services: { backend: [], database: [], canvas: [], ai: [] },
};

describe("SystemHealthPage", () => {
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
    vi.spyOn(systemHealthService, "fetchSystemHealth").mockResolvedValue(healthyResponse);
    vi.spyOn(systemHealthService, "fetchSystemHealthHistory").mockResolvedValue(
      emptyHistoryResponse,
    );
  });

  it("renders all four service cards with their status", async () => {
    renderWithRouter(<SystemHealthPage />);

    await waitFor(() => {
      expect(screen.getByText("Backend")).toBeInTheDocument();
    });

    expect(screen.getByText("Database")).toBeInTheDocument();
    expect(screen.getByText("Canvas connectivity")).toBeInTheDocument();
    expect(screen.getByText("AI service")).toBeInTheDocument();

    expect(screen.getAllByText("Healthy").length).toBeGreaterThan(0);
    expect(screen.getByText("Degraded")).toBeInTheDocument();
    expect(screen.getByText("Down")).toBeInTheDocument();
    expect(screen.getByText("AI service timed out")).toBeInTheDocument();

    // Per-service latency/uptime figures render, not just status labels.
    expect(screen.getByText("Latency: 8 ms")).toBeInTheDocument();
    expect(screen.getByText("Uptime: 2 min")).toBeInTheDocument();
  });

  it("shows the overall status banner reflecting the worst service", async () => {
    vi.spyOn(systemHealthService, "fetchSystemHealth").mockResolvedValue({
      ...healthyResponse,
      overall_status: "down",
    });

    renderWithRouter(<SystemHealthPage />);

    await waitFor(() => {
      expect(screen.getByText("Overall status")).toBeInTheDocument();
    });

    // "Down" appears both in the overall banner and the AI service card --
    // just confirm at least one rendering of it exists.
    expect(screen.getAllByText("Down").length).toBeGreaterThan(0);
    expect(screen.getByText(/Last checked:/)).toBeInTheDocument();
  });

  it("renders the instructor Canvas connections summary with affected instructors", async () => {
    renderWithRouter(<SystemHealthPage />);

    await waitFor(() => {
      expect(screen.getByText("Instructor Canvas connections")).toBeInTheDocument();
    });

    expect(screen.getByText("9 of 10 instructor connections are healthy (1 failing).")).toBeInTheDocument();
    expect(
      screen.getByText("Jane Doe (jane@example.com) — 401 Unauthorized"),
    ).toBeInTheDocument();
  });

  it("renders the instructor AI usage summary with recent failures", async () => {
    renderWithRouter(<SystemHealthPage />);

    await waitFor(() => {
      expect(screen.getByText("Instructor AI usage")).toBeInTheDocument();
    });

    expect(
      screen.getByText("2 instructors had an AI failure in the last hour."),
    ).toBeInTheDocument();
  });

  it("shows a clean instructor summary state when there are no failures", async () => {
    vi.spyOn(systemHealthService, "fetchSystemHealth").mockResolvedValue({
      ...healthyResponse,
      instructor_canvas: { total: 3, healthy: 3, failing: 0, failing_connections: [] },
      instructor_ai: { total: 3, failing_recent: 0 },
    });

    renderWithRouter(<SystemHealthPage />);

    await waitFor(() => {
      expect(screen.getByText("3 of 3 instructor connections are healthy.")).toBeInTheDocument();
    });
    expect(screen.getByText("No AI failures in the last hour.")).toBeInTheDocument();
  });

  it("shows an error state when the health check fails to load", async () => {
    vi.spyOn(systemHealthService, "fetchSystemHealth").mockRejectedValueOnce(
      new Error("network error"),
    );

    renderWithRouter(<SystemHealthPage />);

    expect(
      await screen.findByText("Unable to load system health status."),
    ).toBeInTheDocument();
  });

  it("refetches health status and history when the refresh button is clicked", async () => {
    renderWithRouter(<SystemHealthPage />);

    await waitFor(() => {
      expect(systemHealthService.fetchSystemHealth).toHaveBeenCalledTimes(1);
      expect(systemHealthService.fetchSystemHealthHistory).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "Refresh health status" }));

    await waitFor(() => {
      expect(systemHealthService.fetchSystemHealth).toHaveBeenCalledTimes(2);
      expect(systemHealthService.fetchSystemHealthHistory).toHaveBeenCalledTimes(2);
    });
  });
});
