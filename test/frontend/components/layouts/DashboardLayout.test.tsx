import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { renderWithRouter } from "@test/utils/renderWithRouter";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    logout: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    user: {
      id: 1,
      email: "jane.doe@ubc.ca",
      name: "Dr. Jane Doe",
      role: "instructor" as const,
      is_active: true,
      has_canvas_token: true,
      canvas_connections: [
        {
          id: 1,
          canvas_url: "https://canvas.ubc.ca",
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
