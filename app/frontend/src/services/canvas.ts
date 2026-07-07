import { API_BASE_URL } from "@/config/api";
import { parseApiError } from "@/lib/api-request";
import type {
  ActiveCourseResponse,
  CanvasCourse,
  CanvasTokenUpdateRequest,
  CanvasTokenUpdateResponse,
  CanvasTokenValidationResponse,
  CanvasTokenValidationStatus,
} from "@/types/canvas";

export class CanvasApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CanvasApiError";
    this.status = status;
  }
}

export interface CanvasConnectionInput {
  canvasUrl: string;
  canvasToken: string;
}

export async function updateCanvasToken(
  canvasToken: string,
  accessToken: string,
  canvasUrl?: string,
): Promise<CanvasTokenUpdateResponse> {
  const body: CanvasTokenUpdateRequest = { canvas_token: canvasToken };
  if (canvasUrl) {
    body.canvas_url = canvasUrl;
  }

  const response = await fetch(`${API_BASE_URL}/auth/me/canvas-token`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new CanvasApiError(await parseApiError(response), response.status);
  }

  return response.json() as Promise<CanvasTokenUpdateResponse>;
}

/** Saves one or more connections via separate PATCH requests (one per institution). */
export async function updateCanvasConnections(
  connections: CanvasConnectionInput[],
  accessToken: string,
): Promise<CanvasTokenUpdateResponse> {
  if (connections.length === 0) {
    throw new CanvasApiError("Canvas token is required", 400);
  }

  let lastResponse: CanvasTokenUpdateResponse | undefined;
  for (const { canvasUrl, canvasToken } of connections) {
    lastResponse = await updateCanvasToken(canvasToken, accessToken, canvasUrl);
  }

  return lastResponse!;
}

/** @deprecated Use updateCanvasConnections with canvas URLs instead. */
export async function updateCanvasTokens(
  canvasTokens: string[],
  accessToken: string,
): Promise<CanvasTokenUpdateResponse> {
  if (canvasTokens.length === 0) {
    throw new CanvasApiError("Canvas token is required", 400);
  }

  let lastResponse: CanvasTokenUpdateResponse | undefined;
  for (const token of canvasTokens) {
    lastResponse = await updateCanvasToken(token, accessToken);
  }

  return lastResponse!;
}

export async function removeCanvasConnection(
  connectionId: number,
  accessToken: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/auth/me/canvas-connections/${connectionId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new CanvasApiError(await parseApiError(response), response.status);
  }
}

export async function validateCanvasToken(
  canvasToken: string,
  accessToken: string,
  canvasUrl?: string,
): Promise<CanvasTokenValidationStatus> {
  const body: CanvasTokenUpdateRequest = { canvas_token: canvasToken };
  if (canvasUrl) {
    body.canvas_url = canvasUrl;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/me/canvas-token/validate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return "invalid";
    }

    const data = (await response.json()) as CanvasTokenValidationResponse;
    return data.status;
  } catch {
    return "invalid";
  }
}

export async function fetchCourses(
  accessToken: string,
  canvasUrl?: string,
): Promise<CanvasCourse[]> {
  const params = new URLSearchParams();
  if (canvasUrl) {
    params.set("canvas_url", canvasUrl);
  }

  const query = params.toString();
  const response = await fetch(
    `${API_BASE_URL}/canvas/courses${query ? `?${query}` : ""}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new CanvasApiError(await parseApiError(response), response.status);
  }

  return response.json() as Promise<CanvasCourse[]>;
}

export async function fetchActiveCourse(
  accessToken: string,
): Promise<ActiveCourseResponse | null> {
  const response = await fetch(`${API_BASE_URL}/canvas/active-course`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new CanvasApiError(await parseApiError(response), response.status);
  }

  const data = await response.json();
  return data as ActiveCourseResponse | null;
}

export async function setActiveCourse(
  localCourseId: number,
  accessToken: string,
): Promise<ActiveCourseResponse> {
  const response = await fetch(`${API_BASE_URL}/canvas/active-course`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ local_course_id: localCourseId }),
  });

  if (!response.ok) {
    throw new CanvasApiError(await parseApiError(response), response.status);
  }

  return response.json() as Promise<ActiveCourseResponse>;
}
