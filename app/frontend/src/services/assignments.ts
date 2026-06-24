import { API_BASE_URL } from "@/config/api";
import type { Assignment, AssignmentUpdatePayload } from "@/types/assignment";

export class AssignmentApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AssignmentApiError";
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
    // Fall through to default message.
  }

  return "Something went wrong. Please try again.";
}

function buildCourseAssignmentsUrl(localCourseId: number): string {
  return `${API_BASE_URL}/canvas/courses/${localCourseId}/assignments`;
}

function buildAssignmentUrl(
  localCourseId: number,
  assignmentId: number,
): string {
  return `${API_BASE_URL}/canvas/courses/${localCourseId}/assignments/${assignmentId}`;
}

async function request<T>(
  url: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new AssignmentApiError(await parseError(response), response.status);
  }

  return response.json() as Promise<T>;
}

export async function fetchCourseAssignments(
  localCourseId: number,
  accessToken: string,
): Promise<Assignment[]> {
  return request<Assignment[]>(
    buildCourseAssignmentsUrl(localCourseId),
    accessToken,
  );
}

export async function fetchAssignment(
  localCourseId: number,
  assignmentId: number,
  accessToken: string,
): Promise<Assignment> {
  return request<Assignment>(
    buildAssignmentUrl(localCourseId, assignmentId),
    accessToken,
  );
}

export async function updateAssignment(
  localCourseId: number,
  assignmentId: number,
  payload: AssignmentUpdatePayload,
  accessToken: string,
): Promise<Assignment> {
  return request<Assignment>(
    buildAssignmentUrl(localCourseId, assignmentId),
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}
