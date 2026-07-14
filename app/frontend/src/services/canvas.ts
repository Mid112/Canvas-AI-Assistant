import { API_BASE_URL } from "@/config/api";
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

async function parseError(response: Response): Promise<string> {
  if (response.status === 404) {
    return "The requested API endpoint was not found. Make sure the backend is running.";
  }

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
    throw new CanvasApiError(await parseError(response), response.status);
  }

  return response.json() as Promise<CanvasTokenUpdateResponse>;
}

export interface CanvasConnectionFailure {
  connection: CanvasConnectionInput;
  error: CanvasApiError;
}

export interface CanvasConnectionsSaveResult {
  succeeded: CanvasConnectionInput[];
  failed: CanvasConnectionFailure[];
  lastResponse?: CanvasTokenUpdateResponse;
}

/** Human-readable summary of which connections failed and why. */
export function describeCanvasConnectionFailures(
  failed: CanvasConnectionFailure[],
): string {
  return failed
    .map(({ connection, error }) => `${connection.canvasUrl}: ${error.message}`)
    .join("; ");
}

/**
 * Saves one or more connections via separate PATCH requests (one per
 * institution). Each request is isolated: a failure on one connection does not
 * abort the others, and the result reports exactly which ones saved vs failed
 * so callers can surface partial success. A 401 is re-thrown immediately since
 * it means the session itself is invalid and further requests would also fail.
 */
export async function updateCanvasConnections(
  connections: CanvasConnectionInput[],
  accessToken: string,
): Promise<CanvasConnectionsSaveResult> {
  if (connections.length === 0) {
    throw new CanvasApiError("Canvas token is required", 400);
  }

  const succeeded: CanvasConnectionInput[] = [];
  const failed: CanvasConnectionFailure[] = [];
  let lastResponse: CanvasTokenUpdateResponse | undefined;

  for (const connection of connections) {
    try {
      lastResponse = await updateCanvasToken(
        connection.canvasToken,
        accessToken,
        connection.canvasUrl,
      );
      succeeded.push(connection);
    } catch (error) {
      if (error instanceof CanvasApiError && error.status === 401) {
        throw error;
      }

      failed.push({
        connection,
        error:
          error instanceof CanvasApiError
            ? error
            : new CanvasApiError(
                "Unable to save Canvas connection. Please try again.",
                0,
              ),
      });
    }
  }

  return { succeeded, failed, lastResponse };
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
    throw new CanvasApiError(await parseError(response), response.status);
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
    throw new CanvasApiError(await parseError(response), response.status);
  }

  return response.json() as Promise<CanvasCourse[]>;
}

export async function fetchCachedCourses(
  accessToken: string,
  canvasUrl?: string,
): Promise<CanvasCourse[]> {
  const params = new URLSearchParams();
  if (canvasUrl) {
    params.set("canvas_url", canvasUrl);
  }

  const query = params.toString();
  const response = await fetch(
    `${API_BASE_URL}/canvas/courses/cached${query ? `?${query}` : ""}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new CanvasApiError(await parseError(response), response.status);
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
    throw new CanvasApiError(await parseError(response), response.status);
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
    throw new CanvasApiError(await parseError(response), response.status);
  }

  return response.json() as Promise<ActiveCourseResponse>;
}
