import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InstructorNotificationsPage } from "@/pages/Instructor/InstructorNotificationsPage";
import { fetchNotificationSettings } from "@/services/auth";
import { fetchInstructorDashboard } from "@/services/dashboard";
import { sharedDashboardQuickActions } from "@/types/dashboard";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

vi.mock("@/services/dashboard", () => ({
  fetchInstructorDashboard: vi.fn(),
}));

vi.mock("@/services/auth", async () => {
  const actual = await vi.importActual<typeof import("@/services/auth")>(
    "@/services/auth",
  );
  return {
    ...actual,
    fetchNotificationSettings: vi.fn(),
  };
});

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: () => ({
      user: {
        id: 1,
        email: "jane.doe@example.com",
        name: "Dr. Jane Doe",
        role: "instructor",
        is_active: true,
        has_canvas_token: true,
      },
      accessToken: "token",
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    }),
  };
});

const mockedFetchDashboard = vi.mocked(fetchInstructorDashboard);
const mockedFetchSettings = vi.mocked(fetchNotificationSettings);

const emptyDashboard = {
  metrics: {
    activeCourses: 0,
    activeCoursesTrend: 0,
    totalStudents: 0,
    totalStudentsTrend: 0,
    missingSubmissions: 0,
    missingSubmissionsTrend: 0,
    pendingApprovals: 0,
  },
  recentActivity: [],
  quickActions: sharedDashboardQuickActions,
  activeCourses: [],
  notifications: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedFetchDashboard.mockResolvedValue(emptyDashboard);
  mockedFetchSettings.mockResolvedValue({
    "workflow-approvals": true,
    "new-submissions": false,
  });
});

describe("InstructorNotificationsPage", () => {
  // Verifies: Empty dashboard alerts show the shared empty state (not seed data).
  it("renders an empty state when dashboard has no actionable alerts", async () => {
    renderWithInstitution(<InstructorNotificationsPage />);

    expect(
      screen.getByRole("heading", { name: "Notifications" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Updates for Dr. Jane Doe at UBC."),
    ).toBeInTheDocument();
    expect(await screen.findByText(/No notifications yet/)).toBeInTheDocument();
    expect(
      screen.queryByText(/submissions pending review/i),
    ).not.toBeInTheDocument();
  });

  // Verifies: Ticket 26 — missing, late, and pending workflow alerts appear.
  it("renders dashboard-derived notifications when counts are greater than zero", async () => {
    mockedFetchDashboard.mockResolvedValue({
      ...emptyDashboard,
      metrics: {
        ...emptyDashboard.metrics,
        missingSubmissions: 3,
        pendingApprovals: 1,
      },
      notifications: [
        {
          id: "missing-submissions",
          message: "3 missing submissions need attention",
          timestamp: "Based on latest dashboard data",
          variant: "warning",
        },
        {
          id: "late-submissions",
          message: "2 late submissions detected",
          timestamp: "Based on latest dashboard data",
          variant: "warning",
        },
        {
          id: "pending-workflows",
          message: "1 workflows awaiting approval",
          timestamp: "Based on latest dashboard data",
          variant: "info",
        },
      ],
    });

    renderWithInstitution(<InstructorNotificationsPage />);

    expect(
      await screen.findByText("3 missing submissions need attention"),
    ).toBeInTheDocument();
    expect(screen.getByText("2 late submissions detected")).toBeInTheDocument();
    expect(
      screen.getByText("1 workflows awaiting approval"),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Based on latest dashboard data").length,
    ).toBeGreaterThan(0);
  });

  // Verifies: Ticket 26 — workflow-approvals preference hides pending workflows.
  it("hides pending workflow alerts when workflow-approvals is disabled", async () => {
    mockedFetchDashboard.mockResolvedValue({
      ...emptyDashboard,
      notifications: [
        {
          id: "missing-submissions",
          message: "3 missing submissions need attention",
          timestamp: "Based on latest dashboard data",
          variant: "warning",
        },
        {
          id: "pending-workflows",
          message: "1 workflows awaiting approval",
          timestamp: "Based on latest dashboard data",
          variant: "info",
        },
      ],
    });
    mockedFetchSettings.mockResolvedValue({
      "workflow-approvals": false,
    });

    renderWithInstitution(<InstructorNotificationsPage />);

    expect(
      await screen.findByText("3 missing submissions need attention"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByText("1 workflows awaiting approval"),
      ).not.toBeInTheDocument();
    });
  });
});
