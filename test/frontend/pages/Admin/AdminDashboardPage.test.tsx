import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminDashboardPage } from "@/pages/Admin/AdminDashboardPage";
import { paths } from "@/routes/paths";
import * as adminDashboardService from "@/services/adminDashboard";
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

describe("AdminDashboardPage", () => {
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
    vi.spyOn(adminDashboardService, "fetchAdminDashboard").mockResolvedValue({
      instructor_count: 3,
      admin_count: 1,
      active_workflows: 2,
      audit_events_last_7_days: 5,
    });
  });

  it("renders dashboard metrics and a link to the system health page", async () => {
    renderWithRouter(<AdminDashboardPage />);

    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    const healthLink = screen.getByRole("link", { name: /view system health/i });
    expect(healthLink).toHaveAttribute("href", paths.admin.systemHealth);
  });

  it("shows an error message when metrics fail to load", async () => {
    vi.spyOn(adminDashboardService, "fetchAdminDashboard").mockRejectedValueOnce(
      new Error("network error"),
    );

    renderWithRouter(<AdminDashboardPage />);

    expect(
      await screen.findByText("Unable to load admin dashboard metrics."),
    ).toBeInTheDocument();
  });
});
