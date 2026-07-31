import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import * as systemHealthService from "@/services/systemHealth";
import { renderWithRouter } from "@test/utils/renderWithRouter";

let mockRole: "instructor" | "admin" = "instructor";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    logout: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    user: {
      id: 1,
      email: "jane.doe@ubc.ca",
      name: "Dr. Jane Doe",
      role: mockRole,
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
    refreshUser: vi.fn(),
  }),
}));

vi.mock("@/contexts/ActiveCourseProvider", () => ({
  ActiveCourseProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

function renderDashboard(path: string) {
  return renderWithRouter(
    <Routes>
      <Route path="/" element={<DashboardLayout role="instructor" />}>
        <Route
          path="instructor/dashboard"
          element={<div>Dashboard content</div>}
        />
        <Route
          path="instructor/notifications"
          element={<div>Notifications content</div>}
        />
        <Route
          path="instructor/courses/:id/assignments/:assignmentId/submissions"
          element={<div>Submissions content</div>}
        />
      </Route>
    </Routes>,
    {
      routerProps: {
        initialEntries: [path],
      },
    },
  );
}

describe("DashboardLayout", () => {
  // #689 / #691 — Layout chrome and responsive shell
  // Verifies: Page title resolves from the current instructor route.
  it("sets the header title from the current route", () => {
    renderDashboard("/instructor/dashboard");

    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Dashboard content")).toBeInTheDocument();
  });

  // Verifies: Notifications path uses a dedicated title.
  it("titles the notifications page correctly", () => {
    renderDashboard("/instructor/notifications");

    expect(
      screen.getByRole("heading", { name: "Notifications" }),
    ).toBeInTheDocument();
  });

  // Verifies: Nested submissions routes get the Assignment Submissions title.
  it("titles assignment submission routes correctly", () => {
    renderDashboard("/instructor/courses/10/assignments/3/submissions");

    expect(
      screen.getByRole("heading", { name: "Assignment Submissions" }),
    ).toBeInTheDocument();
  });

  // Verifies: Mobile navigation trigger is present for small viewports.
  it("exposes a mobile navigation menu trigger", () => {
    renderDashboard("/instructor/dashboard");

    const mobileTrigger = screen.getByRole("button", {
      name: "Open navigation menu",
    });
    expect(mobileTrigger).toBeInTheDocument();
    expect(mobileTrigger.className).toMatch(/lg:hidden/);
  });

  // Verifies: Opening the mobile menu reveals navigation links.
  it("opens the mobile navigation sheet with instructor links", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderDashboard("/instructor/dashboard");

    await user.click(
      screen.getByRole("button", { name: "Open navigation menu" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Navigation" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "AI Assistant" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByRole("link", { name: "Messages" }).length,
    ).toBeGreaterThan(0);
  });
});

describe("DashboardLayout admin nav health badge", () => {
  function renderAdminDashboard(path: string) {
    return renderWithRouter(
      <Routes>
        <Route path="/" element={<DashboardLayout role="admin" />}>
          <Route path="admin/dashboard" element={<div>Admin dashboard content</div>} />
        </Route>
      </Routes>,
      { routerProps: { initialEntries: [path] } },
    );
  }

  afterEach(() => {
    mockRole = "instructor";
  });

  // Verifies: the nav badge is seeded from GET /admin/health/latest on
  // mount for admins (DashboardLayout.tsx's role === "admin" fetch effect).
  it("decorates the System Health nav item once /admin/health/latest resolves", async () => {
    mockRole = "admin";
    vi.spyOn(systemHealthService, "fetchLatestSystemHealth").mockResolvedValue({
      overall_status: "degraded",
      checked_at: "2026-07-21T18:00:00Z",
      services: {},
    });

    renderAdminDashboard("/admin/dashboard");

    await waitFor(() => {
      expect(
        screen.getByLabelText("System Health status: degraded"),
      ).toBeInTheDocument();
    });
  });

  // Verifies: "unknown" (nothing checked yet) renders calm, not a false alarm.
  it("does not badge the nav item when the latest status is unknown", async () => {
    mockRole = "admin";
    vi.spyOn(systemHealthService, "fetchLatestSystemHealth").mockResolvedValue({
      overall_status: "unknown",
      checked_at: null,
      services: {},
    });

    renderAdminDashboard("/admin/dashboard");

    await waitFor(() => {
      expect(screen.getByText("Admin dashboard content")).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/System Health status:/)).not.toBeInTheDocument();
  });
});
