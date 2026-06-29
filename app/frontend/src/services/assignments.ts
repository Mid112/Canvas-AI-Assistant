import { API_BASE_URL } from "@/config/api";
import type { Assignment, AssignmentCreatePayload, AssignmentUpdatePayload } from "@/types/assignment";

/**
 * Canvas assignment API client.
 *
 * On develop, /canvas/courses/{id}/assignments treats {id} as the Canvas course ID
 * and requires canvas_url so the backend can pick the right stored token.
 * In-app routes still use local_id — resolve via useCanvasCourseByLocalId first.
 */
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

function withCanvasUrl(path: string, canvasUrl: string): string {
  const params = new URLSearchParams({ canvas_url: canvasUrl });
  return `${path}?${params.toString()}`;
}

function buildCourseAssignmentsUrl(
  canvasCourseId: number,
  canvasUrl: string,
): string {
  return withCanvasUrl(
    `${API_BASE_URL}/canvas/courses/${canvasCourseId}/assignments`,
    canvasUrl,
  );
}

function buildAssignmentUrl(
  canvasCourseId: number,
  assignmentId: number,
  canvasUrl: string,
): string {
  return withCanvasUrl(
    `${API_BASE_URL}/canvas/courses/${canvasCourseId}/assignments/${assignmentId}`,
    canvasUrl,
  );
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
  canvasCourseId: number,
  accessToken: string,
  canvasUrl: string,
): Promise<Assignment[]> {
  return request<Assignment[]>(
    buildCourseAssignmentsUrl(canvasCourseId, canvasUrl),
    accessToken,
  );
}

export async function fetchAssignment(
  canvasCourseId: number,
  assignmentId: number,
  accessToken: string,
  canvasUrl: string,
): Promise<Assignment> {
  return request<Assignment>(
    buildAssignmentUrl(canvasCourseId, assignmentId, canvasUrl),
    accessToken,
  );
}

export async function createAssignment(
  canvasCourseId: number,
  payload: AssignmentCreatePayload,
  accessToken: string,
  canvasUrl: string,
): Promise<Assignment> {
  return request<Assignment>(
    buildCourseAssignmentsUrl(canvasCourseId, canvasUrl),
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function updateAssignment(
  canvasCourseId: number,
  assignmentId: number,
  payload: AssignmentUpdatePayload,
  accessToken: string,
  canvasUrl: string,
): Promise<Assignment> {
  return request<Assignment>(
    buildAssignmentUrl(canvasCourseId, assignmentId, canvasUrl),
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}
