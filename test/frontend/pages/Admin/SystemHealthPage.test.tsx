import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SystemHealthBadgeProvider,
  useSystemHealthBadge,
} from "@/contexts/SystemHealthBadgeContext";
import { SystemHealthPage } from "@/pages/Admin/SystemHealthPage";
import * as systemHealthService from "@/services/systemHealth";
import { renderWithRouter } from "@test/utils/renderWithRouter";

function BadgeStatusProbe() {
  const { status } = useSystemHealthBadge();
  return <span data-testid="badge-status">{status ?? "none"}</span>;
}

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

  it("renders both failing connections for an instructor with two Canvas URLs", async () => {
    // Regression test: failing_connections previously keyed list items by
    // user_email alone, which collides when one instructor has multiple
    // Canvas connections.
    vi.spyOn(systemHealthService, "fetchSystemHealth").mockResolvedValue({
      ...healthyResponse,
      instructor_canvas: {
        total: 2,
        healthy: 0,
        failing: 2,
        failing_connections: [
          {
            user_name: "Jane Doe",
            user_email: "jane@example.com",
            canvas_url: "https://canvas-a.example.edu",
            error_detail: "401 Unauthorized",
          },
          {
            user_name: "Jane Doe",
            user_email: "jane@example.com",
            canvas_url: "https://canvas-b.example.edu",
            error_detail: "403 Forbidden",
          },
        ],
      },
    });

    renderWithRouter(<SystemHealthPage />);

    await waitFor(() => {
      expect(screen.getByText("Jane Doe (jane@example.com) — 401 Unauthorized")).toBeInTheDocument();
    });
    expect(screen.getByText("Jane Doe (jane@example.com) — 403 Forbidden")).toBeInTheDocument();
  });

  it("caps the history sparkline to the most recent points", async () => {
    const manyEntries = Array.from({ length: 60 }, (_, i) => ({
      status: "healthy" as const,
      latency_ms: i,
      checked_at: new Date(2026, 0, 1, 0, i).toISOString(),
    }));
    vi.spyOn(systemHealthService, "fetchSystemHealthHistory").mockResolvedValue({
      services: { backend: manyEntries, database: [], canvas: [], ai: [] },
    });

    renderWithRouter(<SystemHealthPage />);

    await waitFor(() => {
      expect(screen.getByText("Backend")).toBeInTheDocument();
    });

    // 60 entries in, capped display must render fewer than that -- and the
    // most recent one (index 59) must still be present (a naive head-slice
    // instead of a tail-slice would drop it).
    const dots = screen.getAllByTitle(/healthy at/);
    expect(dots.length).toBeLessThan(60);
    expect(
      screen.getByTitle(`healthy at ${new Date(manyEntries[59].checked_at).toLocaleString()}`),
    ).toBeInTheDocument();
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

  it("pushes the live overall_status into the shared nav badge on load and on refresh", async () => {
    vi.spyOn(systemHealthService, "fetchSystemHealth").mockResolvedValueOnce(healthyResponse);

    renderWithRouter(
      <SystemHealthBadgeProvider>
        <BadgeStatusProbe />
        <SystemHealthPage />
      </SystemHealthBadgeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("badge-status")).toHaveTextContent("healthy");
    });

    vi.spyOn(systemHealthService, "fetchSystemHealth").mockResolvedValueOnce({
      ...healthyResponse,
      overall_status: "down",
    });

    await user.click(screen.getByRole("button", { name: "Refresh health status" }));

    // The sidebar badge must reflect this refresh immediately -- not just
    // whatever GET /admin/health/latest returned on the last layout mount.
    await waitFor(() => {
      expect(screen.getByTestId("badge-status")).toHaveTextContent("down");
    });
  });
});
