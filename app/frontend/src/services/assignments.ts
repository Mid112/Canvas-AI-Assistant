import { API_BASE_URL } from "@/config/api";
import type { Assignment, AssignmentCreatePayload, AssignmentUpdatePayload } from "@/types/assignment";

/**
 * Canvas assignment API client.
 *
 * Assignment calls use local course IDs and optional canvas_url.
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

function appendCanvasUrl(url: string, canvasUrl?: string): string {
  if (!canvasUrl) {
    return url;
  }

  // The backend can store tokens for multiple Canvas hosts. Passing canvas_url
  // keeps assignment calls aligned with the connection selected by the UI.
  const params = new URLSearchParams({ canvas_url: canvasUrl });
  return `${url}?${params.toString()}`;
}

function buildCourseAssignmentsUrl(
  localCourseId: number,
  canvasUrl?: string,
): string {
  return appendCanvasUrl(
    `${API_BASE_URL}/canvas/courses/${localCourseId}/assignments`,
    canvasUrl,
  );
}

function buildAssignmentUrl(
  localCourseId: number,
  assignmentId: number,
  canvasUrl?: string,
): string {
  return appendCanvasUrl(
    `${API_BASE_URL}/canvas/courses/${localCourseId}/assignments/${assignmentId}`,
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
  localCourseId: number,
  accessToken: string,
  canvasUrl?: string,
): Promise<Assignment[]> {
  return request<Assignment[]>(
    buildCourseAssignmentsUrl(localCourseId, canvasUrl),
    accessToken,
  );
}

export async function fetchAssignment(
  localCourseId: number,
  assignmentId: number,
  accessToken: string,
  canvasUrl?: string,
): Promise<Assignment> {
  return request<Assignment>(
    buildAssignmentUrl(localCourseId, assignmentId, canvasUrl),
    accessToken,
  );
}

export async function createAssignment(
  localCourseId: number,
  payload: AssignmentCreatePayload,
  accessToken: string,
  canvasUrl?: string,
): Promise<Assignment> {
  return request<Assignment>(
    buildCourseAssignmentsUrl(localCourseId, canvasUrl),
    accessToken,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function updateAssignment(
  localCourseId: number,
  assignmentId: number,
  payload: AssignmentUpdatePayload,
  accessToken: string,
  canvasUrl?: string,
): Promise<Assignment> {
  return request<Assignment>(
    buildAssignmentUrl(localCourseId, assignmentId, canvasUrl),
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

/** Publish or unpublish an assignment in Canvas from Course Assignments. */
export async function setAssignmentPublished(
  localCourseId: number,
  assignmentId: number,
  published: boolean,
  accessToken: string,
  canvasUrl?: string,
): Promise<Assignment> {
  return request<Assignment>(
    appendCanvasUrl(
      `${API_BASE_URL}/canvas/courses/${localCourseId}/assignments/${assignmentId}/publish`,
      canvasUrl,
    ),
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify({ published }),
    },
  );
}
