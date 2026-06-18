import { API_BASE_URL } from "@/config/api";
import { CANVAS_API_URL } from "@/config/canvas";
import type {
  CanvasTokenUpdateRequest,
  CanvasTokenUpdateResponse,
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

export async function updateCanvasTokens(
  canvasTokens: string[],
  accessToken: string,
): Promise<CanvasTokenUpdateResponse> {
  const body: CanvasTokenUpdateRequest = { canvas_tokens: canvasTokens };

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

export async function validateCanvasToken(
  canvasToken: string,
): Promise<CanvasTokenValidationStatus> {
  try {
    const response = await fetch(`${CANVAS_API_URL}/users/self`, {
      headers: {
        Authorization: `Bearer ${canvasToken}`,
      },
    });

    if (response.status === 401) {
      return "expired";
    }

    if (response.ok) {
      return "valid";
    }

    return "invalid";
  } catch {
    return "invalid";
  }
}
