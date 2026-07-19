import { API_BASE_URL } from "@/config/api";
import type {
  GradePreview,
  GradeUpdatePayload,
  GradeUpdateResult,
} from "@/types/gradeManagement";

export class GradeManagementApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "GradeManagementApiError";
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
    if (Array.isArray(data.detail)) {
      const first = data.detail.find((item) => typeof item.msg === "string");
      if (first?.msg) {
        return first.msg;
      }
    }
  } catch {
    // Fall through.
  }
  return "Unable to update the grade.";
}

function buildGradeUrl(
  localCourseId: number,
  action: "preview" | "submit",
  canvasUrl?: string,
) {
  const params = new URLSearchParams();
  if (canvasUrl) {
    params.set("canvas_url", canvasUrl);
  }
  const query = params.toString();
  return `${API_BASE_URL}/canvas/courses/${localCourseId}/grades/${action}${query ? `?${query}` : ""}`;
}

async function request<T>(
  localCourseId: number,
  action: "preview" | "submit",
  payload: GradeUpdatePayload,
  accessToken: string,
  canvasUrl?: string,
): Promise<T> {
  const response = await fetch(buildGradeUrl(localCourseId, action, canvasUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new GradeManagementApiError(await parseError(response), response.status);
  }

  return response.json() as Promise<T>;
}

export function previewGradeUpdate(
  localCourseId: number,
  payload: GradeUpdatePayload,
  accessToken: string,
  canvasUrl?: string,
) {
  return request<GradePreview>(
    localCourseId,
    "preview",
    payload,
    accessToken,
    canvasUrl,
  );
}

export function submitGradeUpdate(
  localCourseId: number,
  payload: GradeUpdatePayload,
  accessToken: string,
  canvasUrl?: string,
) {
  return request<GradeUpdateResult>(
    localCourseId,
    "submit",
    payload,
    accessToken,
    canvasUrl,
  );
}
