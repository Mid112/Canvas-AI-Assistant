import { API_BASE_URL } from "@/config/api";
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

function buildStudentsUrl(canvasCourseId: number, canvasUrl?: string): string {
  const params = new URLSearchParams();
  if (canvasUrl) {
    params.set("canvas_url", canvasUrl);
  }
  const query = params.toString();
  return `${API_BASE_URL}/canvas/courses/${canvasCourseId}/students${query ? `?${query}` : ""}`;
}

/** Backend students route uses the Canvas course id, not the local DB id. */
export async function fetchCourseStudents(
  canvasCourseId: number,
  accessToken: string,
  canvasUrl?: string,
): Promise<CourseStudent[]> {
  const response = await fetch(buildStudentsUrl(canvasCourseId, canvasUrl), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new StudentApiError(await parseError(response), response.status);
  }

  return response.json() as Promise<CourseStudent[]>;
}
