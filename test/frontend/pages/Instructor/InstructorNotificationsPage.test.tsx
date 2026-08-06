// Test note: covers the instructor notifications page.test behavior so future changes can preserve the expected Canvas workflow contract.

import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InstructorNotificationsPage } from "@/pages/Instructor/InstructorNotificationsPage";
import { instructorSettingsPath } from "@/routes/paths";
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
    "grade-updates": true,
    "new-submissions": true,
    "urgent-workflows": true,
    "daily-summary": false,
  });
});

describe("InstructorNotificationsPage", () => {
  it("renders an empty state when dashboard has no actionable alerts", async () => {
    renderWithInstitution(<InstructorNotificationsPage />);

    expect(
      screen.getByRole("heading", { name: "Notifications" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Manage notification preferences" }),
    ).toHaveAttribute("href", instructorSettingsPath("notifications"));
    expect(await screen.findByText(/No notifications yet/)).toBeInTheDocument();
  });

  it("renders Settings-aligned notification categories from dashboard data", async () => {
    mockedFetchDashboard.mockResolvedValue({
      ...emptyDashboard,
      notifications: [
        {
          id: "workflow-approvals",
          message: "1 workflow awaiting approval",
          timestamp: "Based on latest dashboard data",
          variant: "info",
        },
        {
          id: "grade-updates",
          message: "1 recent grade or feedback update",
          timestamp: "2026-10-04T12:00:00Z",
          variant: "success",
        },
        {
          id: "new-submissions",
          message: "3 missing submissions need attention",
          timestamp: "Based on latest dashboard data",
          variant: "warning",
        },
        {
          id: "urgent-workflows",
          message: "2 late submissions need urgent follow-up",
          timestamp: "Based on latest dashboard data",
          variant: "warning",
        },
        {
          id: "daily-summary",
          message: "Course summary: 2 courses, 45 students, 8 assignments",
          timestamp: "Based on latest dashboard data",
          variant: "info",
        },
      ],
    });
    mockedFetchSettings.mockResolvedValue({
      "workflow-approvals": true,
      "grade-updates": true,
      "new-submissions": true,
      "urgent-workflows": true,
      "daily-summary": true,
    });

    renderWithInstitution(<InstructorNotificationsPage />);

    expect(
      await screen.findByText("1 workflow awaiting approval"),
    ).toBeInTheDocument();
    expect(screen.getByText("Workflow Approvals")).toBeInTheDocument();
    expect(screen.getByText("Grade Updates")).toBeInTheDocument();
    expect(screen.getByText("New Submissions")).toBeInTheDocument();
    expect(screen.getByText("Urgent Workflows")).toBeInTheDocument();
    expect(screen.getByText("Daily Summary")).toBeInTheDocument();
  });

  it("hides alerts whose Settings toggles are disabled", async () => {
    mockedFetchDashboard.mockResolvedValue({
      ...emptyDashboard,
      notifications: [
        {
          id: "new-submissions",
          message: "3 missing submissions need attention",
          timestamp: "Based on latest dashboard data",
          variant: "warning",
        },
        {
          id: "workflow-approvals",
          message: "1 workflow awaiting approval",
          timestamp: "Based on latest dashboard data",
          variant: "info",
        },
      ],
    });
    mockedFetchSettings.mockResolvedValue({
      "workflow-approvals": false,
      "new-submissions": true,
    });

    renderWithInstitution(<InstructorNotificationsPage />);

    expect(
      await screen.findByText("3 missing submissions need attention"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByText("1 workflow awaiting approval"),
      ).not.toBeInTheDocument();
    });
  });
});
