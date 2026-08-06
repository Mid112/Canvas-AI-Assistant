// Frontend service note: wraps students API calls and normalizes payloads for route/components.

import { API_BASE_URL } from "@/config/api";
import { fetchCourseAssignments } from "@/services/assignments";
import { fetchAssignmentSubmissions } from "@/services/submissions";
import type { CourseStudent } from "@/types/student";

export class StudentApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StudentApiError";
    this.status = status;
  }
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      detail?: string | Array<{ msg?: string }>;
    };

    if (typeof data.detail === "string") {
      return data.detail;
    }

    if (Array.isArray(data.detail) && data.detail.length > 0) {
      const firstMessage = data.detail.find(
        (item) => typeof item.msg === "string",
      )?.msg;

      if (firstMessage) {
        return firstMessage;
      }
    }
  } catch {
    // Fall through.
  }

  return "Something went wrong. Please try again.";
}

function buildStudentsUrl(localCourseId: number, canvasUrl?: string): string {
  const params = new URLSearchParams();
  if (canvasUrl) {
    params.set("canvas_url", canvasUrl);
  }
  const query = params.toString();
  return `${API_BASE_URL}/canvas/courses/${localCourseId}/students${query ? `?${query}` : ""}`;
}

/** Backend students route uses the local DB course id, consistent with sibling course endpoints. */
export async function fetchCourseStudents(
  localCourseId: number,
  accessToken: string,
  canvasUrl?: string,
): Promise<CourseStudent[]> {
  const response = await fetch(buildStudentsUrl(localCourseId, canvasUrl), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new StudentApiError(await parseError(response), response.status);
  }

  return response.json() as Promise<CourseStudent[]>;
}

export async function fetchStudentsFromSubmissions(
  localCourseId: number,
  accessToken: string,
  canvasUrl?: string,
): Promise<CourseStudent[]> {
  const assignments = await fetchCourseAssignments(
    localCourseId,
    accessToken,
    canvasUrl,
  );
  if (assignments.length === 0) {
    return [];
  }

  const assignmentSubmissions = await Promise.all(
    assignments.map((assignment) =>
      fetchAssignmentSubmissions(
        localCourseId,
        assignment.id,
        accessToken,
        canvasUrl,
      ),
    ),
  );
  const studentsByCanvasId = new Map<string, CourseStudent>();

  assignmentSubmissions.flat().forEach((submission) => {
    const canvasUserId = String(submission.user_id);
    if (studentsByCanvasId.has(canvasUserId)) {
      return;
    }

    studentsByCanvasId.set(canvasUserId, {
      id: submission.user_id,
      canvas_user_id: canvasUserId,
      course_id: localCourseId,
      name: submission.student_name ?? `Student ${canvasUserId}`,
      sortable_name: null,
      login_id: submission.student_email ?? submission.student_login_id,
      enrollment_state: "active",
    });
  });

  return Array.from(studentsByCanvasId.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export async function fetchCourseStudentsWithSubmissionFallback(
  localCourseId: number,
  accessToken: string,
  canvasUrl?: string,
  expectedStudentCount = 0,
): Promise<CourseStudent[]> {
  const students = await fetchCourseStudents(
    localCourseId,
    accessToken,
    canvasUrl,
  );

  if (students.length > 0 || expectedStudentCount <= 0) {
    return students;
  }

  // Canvas can expose students through submissions even when the enrollment
  // roster endpoint returns empty, so use the analytics source as a fallback.
  return fetchStudentsFromSubmissions(localCourseId, accessToken, canvasUrl);
}
