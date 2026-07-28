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

function stringifyErrorDetail(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const messages = value
      .map((item) => stringifyErrorDetail(item))
      .filter((item): item is string => Boolean(item));
    return messages.length > 0 ? messages.join("; ") : null;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.msg === "string") {
      return record.msg;
    }
    if (typeof record.message === "string") {
      return record.message;
    }
    if (typeof record.error === "string") {
      return record.error;
    }
    const messages = Object.entries(record)
      .map(([field, detail]) => {
        const message = stringifyErrorDetail(detail);
        return message ? `${field}: ${message}` : null;
      })
      .filter((item): item is string => Boolean(item));
    return messages.length > 0 ? messages.join("; ") : null;
  }
  return null;
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.clone().json()) as { detail?: unknown };
    const detail = stringifyErrorDetail(data.detail);
    if (detail) {
      return detail;
    }
  } catch {
    try {
      const text = await response.text();
      if (text.trim()) {
        return text.trim();
      }
    } catch {
      // Fall through.
    }
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
