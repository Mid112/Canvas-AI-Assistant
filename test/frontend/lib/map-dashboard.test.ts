import { describe, expect, it } from "vitest";

import {
  mapInstructorDashboardApiToData,
  mapRecentWorkflowsToActivity,
  type InstructorDashboardApiResponse,
} from "@/lib/map-dashboard";
import { sharedDashboardQuickActions } from "@/types/dashboard";

const baseResponse: InstructorDashboardApiResponse = {
  course_count: 2,
  student_count: 45,
  assignment_count: 8,
  missing_submissions: 0,
  late_submissions: 0,
  pending_workflows: 0,
  active_course: {
    local_id: 1,
    name: "CS 101: Intro",
    canvas_course_id: 123,
  },
  courses: [
    {
      local_id: 1,
      name: "CS 101: Intro",
      student_count: 30,
      assignment_count: 5,
      missing_submissions: 0,
      late_submissions: 0,
    },
    {
      local_id: 2,
      name: "MATH 200",
      student_count: 15,
      assignment_count: 3,
      missing_submissions: 0,
      late_submissions: 0,
    },
  ],
  recent_workflows: [
    {
      id: 10,
      action_name: "create_assignment",
      user_prompt: "Create quiz",
      status: "completed",
      created_at: "2026-10-01T12:00:00Z",
    },
    {
      id: 11,
      action_name: "send_message",
      user_prompt: "Announce exam",
      status: "completed",
      created_at: "2026-10-02T12:00:00Z",
    },
    {
      id: 12,
      action_name: "unknown_action",
      user_prompt: "Other",
      status: "completed",
      created_at: "2026-10-03T12:00:00Z",
    },
  ],
};

describe("mapInstructorDashboardApiToData", () => {
  it("maps overview metrics, courses, and activity", () => {
    const result = mapInstructorDashboardApiToData(baseResponse);

    expect(result.metrics).toEqual({
      activeCourses: 2,
      activeCoursesTrend: 0,
      totalStudents: 45,
      totalStudentsTrend: 0,
      missingSubmissions: 0,
      missingSubmissionsTrend: 0,
      pendingApprovals: 0,
    });
    expect(result.quickActions).toEqual(sharedDashboardQuickActions);
    expect(result.activeCourses).toEqual([
      {
        id: 1,
        code: "CS 101",
        name: "CS 101: Intro",
        studentCount: 30,
        assignmentCount: 5,
      },
      {
        id: 2,
        code: "MATH 200",
        name: "MATH 200",
        studentCount: 15,
        assignmentCount: 3,
      },
    ]);
    expect(result.recentActivity).toEqual([
      {
        id: "10",
        type: "assignment_created",
        title: "Create Assignment",
        courseLabel: "CS 101: Intro",
        timestamp: "2026-10-01T12:00:00Z",
      },
      {
        id: "11",
        type: "announcement_posted",
        title: "Send Message",
        courseLabel: "CS 101: Intro",
        timestamp: "2026-10-02T12:00:00Z",
      },
      {
        id: "12",
        type: "message_received",
        title: "Unknown Action",
        courseLabel: "CS 101: Intro",
        timestamp: "2026-10-03T12:00:00Z",
      },
    ]);
    expect(result.notifications).toEqual([
      {
        id: "daily-summary",
        message: "Course summary: 2 courses, 45 students, 8 assignments",
        timestamp: "Based on latest dashboard data",
        variant: "info",
      },
    ]);
  });

  it("adds notifications aligned with Settings preference IDs", () => {
    const result = mapInstructorDashboardApiToData({
      ...baseResponse,
      missing_submissions: 3,
      late_submissions: 2,
      pending_workflows: 1,
      recent_workflows: [
        ...baseResponse.recent_workflows,
        {
          id: 13,
          action_name: "update_grade",
          user_prompt: "Post grade",
          status: "completed",
          created_at: "2026-10-04T12:00:00Z",
        },
      ],
    });

    expect(result.notifications.map((item) => item.id)).toEqual([
      "workflow-approvals",
      "grade-updates",
      "new-submissions",
      "urgent-workflows",
      "daily-summary",
    ]);
    expect(result.notifications[0]?.message).toMatch(/1 workflow awaiting/);
    expect(result.notifications[1]?.message).toMatch(/1 recent grade/);
    expect(result.notifications[2]?.message).toMatch(/3 missing submission/);
    expect(result.notifications[3]?.message).toMatch(/2 late submission/);
  });

  // Verifies: Ticket 26 — remapping the same payload keeps stable timestamps.
  it("uses a stable timestamp label that does not change across remaps", () => {
    const payload = {
      ...baseResponse,
      missing_submissions: 1,
      late_submissions: 1,
      pending_workflows: 1,
    };

    const first = mapInstructorDashboardApiToData(payload);
    const second = mapInstructorDashboardApiToData(payload);

    expect(first.notifications.map((item) => item.timestamp)).toEqual(
      second.notifications.map((item) => item.timestamp),
    );
    expect(
      first.notifications.find((item) => item.id === "new-submissions")
        ?.timestamp,
    ).toBe("Based on latest dashboard data");
  });

  it("uses a fallback course label when no active course is present", () => {
    const result = mapInstructorDashboardApiToData({
      ...baseResponse,
      active_course: null,
    });

    expect(result.recentActivity[0]?.courseLabel).toBe("Your courses");
  });
});

describe("mapRecentWorkflowsToActivity", () => {
  it("returns only recent activity entries", () => {
    expect(mapRecentWorkflowsToActivity(baseResponse)).toEqual(
      mapInstructorDashboardApiToData(baseResponse).recentActivity,
    );
  });
});
