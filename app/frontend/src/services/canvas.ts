import { API_BASE_URL } from "@/config/api";
import type {
  CanvasTokenUpdateRequest,
  CanvasTokenUpdateResponse,
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
  try {
    const data = (await response.json()) as { detail?: string };
    if (typeof data.detail === "string") {
      return data.detail;
    }
  } catch {
    // Fall through to default message.
  }

  return "Something went wrong. Please try again.";
}

export async function updateCanvasToken(
  canvasToken: string,
  accessToken: string,
): Promise<CanvasTokenUpdateResponse> {
  const body: CanvasTokenUpdateRequest = { canvas_token: canvasToken };

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
