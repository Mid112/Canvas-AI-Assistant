// Frontend helper note: centralizes map course overview behavior so components and tests share one implementation.

import type { CourseOverviewData } from "@/types/courseOverview";

export interface CourseOverviewApiResponse {
  local_id: number;
  canvas_course_id: string;
  name: string;
  term: string | null;
  is_active: boolean;
  student_count: number;
  assignment_count: number;
  missing_submissions: number;
  late_submissions: number;
  average_grade: number | null;
  completion_rate: number | null;
  recent_assignments: Array<{
    local_id: number;
    title: string;
    due_date: string | null;
    submitted_count: number;
    total_students: number;
    status: "active" | "upcoming" | "completed";
  }>;
  recent_activity: Array<{
    student_name: string;
    action: string;
    occurred_at: string;
  }>;
}

export function mapCourseOverviewApiToData(
  response: CourseOverviewApiResponse,
): CourseOverviewData {
  return {
    localId: response.local_id,
    canvasCourseId: response.canvas_course_id,
    name: response.name,
    term: response.term,
    isActive: response.is_active,
    studentCount: response.student_count,
    assignmentCount: response.assignment_count,
    missingSubmissions: response.missing_submissions,
    lateSubmissions: response.late_submissions,
    averageGrade: response.average_grade,
    completionRate: response.completion_rate,
    recentAssignments: response.recent_assignments.map((assignment) => ({
      localId: assignment.local_id,
      title: assignment.title,
      dueDate: assignment.due_date,
      submittedCount: assignment.submitted_count,
      totalStudents: assignment.total_students,
      status: assignment.status,
    })),
    recentActivity: response.recent_activity.map((activity) => ({
      studentName: activity.student_name,
      action: activity.action,
      occurredAt: activity.occurred_at,
    })),
  };
}
