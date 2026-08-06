// Frontend service note: wraps submissions API calls and normalizes payloads for route/components.

import { API_BASE_URL } from "@/config/api";
import type { ApiSubmission } from "@/types/submission";

export class SubmissionApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SubmissionApiError";
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

function buildSubmissionsUrl(
  localCourseId: number,
  assignmentId: number,
  canvasUrl?: string,
): string {
  const params = new URLSearchParams();
  if (canvasUrl) {
    params.set("canvas_url", canvasUrl);
  }
  const query = params.toString();
  return `${API_BASE_URL}/canvas/courses/${localCourseId}/assignments/${assignmentId}/submissions${query ? `?${query}` : ""}`;
}

export async function fetchAssignmentSubmissions(
  localCourseId: number,
  assignmentId: number,
  accessToken: string,
  canvasUrl?: string,
): Promise<ApiSubmission[]> {
  const response = await fetch(
    buildSubmissionsUrl(localCourseId, assignmentId, canvasUrl),
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new SubmissionApiError(await parseError(response), response.status);
  }

  return response.json() as Promise<ApiSubmission[]>;
}
