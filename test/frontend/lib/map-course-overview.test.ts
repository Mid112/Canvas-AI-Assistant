// Test note: covers the map course overview.test behavior so future changes can preserve the expected Canvas workflow contract.

import { describe, expect, it } from "vitest";

import {
  mapCourseOverviewApiToData,
  type CourseOverviewApiResponse,
} from "@/lib/map-course-overview";

describe("mapCourseOverviewApiToData", () => {
  // Verifies: Maps snake_case overview fields to frontend shape.
  it("maps snake_case overview fields to frontend shape", () => {
    const response: CourseOverviewApiResponse = {
      local_id: 1,
      canvas_course_id: "12345",
      name: "CS 101: Introduction to Programming",
      term: "Fall 2026",
      is_active: true,
      student_count: 45,
      assignment_count: 8,
      missing_submissions: 2,
      late_submissions: 1,
      average_grade: 82,
      completion_rate: 91,
      recent_assignments: [
        {
          local_id: 10,
          title: "Quiz 1",
          due_date: "2026-10-01T00:00:00Z",
          submitted_count: 40,
          total_students: 45,
          status: "active",
        },
      ],
      recent_activity: [
        {
          student_name: "Sarah Johnson",
          action: "Submitted Quiz 1",
          occurred_at: "2026-10-01T12:00:00Z",
        },
      ],
    };

    expect(mapCourseOverviewApiToData(response)).toEqual({
      localId: 1,
      canvasCourseId: "12345",
      name: "CS 101: Introduction to Programming",
      term: "Fall 2026",
      isActive: true,
      studentCount: 45,
      assignmentCount: 8,
      missingSubmissions: 2,
      lateSubmissions: 1,
      averageGrade: 82,
      completionRate: 91,
      recentAssignments: [
        {
          localId: 10,
          title: "Quiz 1",
          dueDate: "2026-10-01T00:00:00Z",
          submittedCount: 40,
          totalStudents: 45,
          status: "active",
        },
      ],
      recentActivity: [
        {
          studentName: "Sarah Johnson",
          action: "Submitted Quiz 1",
          occurredAt: "2026-10-01T12:00:00Z",
        },
      ],
    });
  });
});
