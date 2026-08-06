// Test note: covers the dashboard.test behavior so future changes can preserve the expected Canvas workflow contract.

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchInstructorDashboard,
  INSTRUCTOR_DASHBOARD_PATH,
} from "@/services/dashboard";

vi.mock("@/config/api", () => ({
  API_BASE_URL: "http://localhost:8000/api/v1",
}));

const dashboardResponse = {
  course_count: 1,
  student_count: 20,
  assignment_count: 4,
  missing_submissions: 0,
  late_submissions: 0,
  pending_workflows: 0,
  active_course: null,
  courses: [],
  recent_workflows: [],
};

describe("dashboard service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and maps the instructor dashboard", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(dashboardResponse), { status: 200 }),
    );

    const result = await fetchInstructorDashboard("access-token");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `http://localhost:8000/api/v1${INSTRUCTOR_DASHBOARD_PATH}`,
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(result.metrics.activeCourses).toBe(1);
    expect(result.notifications).toEqual([
      {
        id: "daily-summary",
        message: "Course summary: 1 course, 20 students, 4 assignments",
        timestamp: "Based on latest dashboard data",
        variant: "info",
      },
    ]);
  });
});
