// Frontend helper note: centralizes canvas connection behavior so components and tests share one implementation.

import { AssignmentApiError } from "@/services/assignments";
import { CanvasApiError } from "@/services/canvas";
import { StudentApiError } from "@/services/students";
import { SubmissionApiError } from "@/services/submissions";

function getConnectionErrorDetails(
  error: unknown,
): { status: number; message: string } | null {
  if (
    error instanceof CanvasApiError ||
    error instanceof AssignmentApiError ||
    error instanceof StudentApiError ||
    error instanceof SubmissionApiError
  ) {
    return { status: error.status, message: error.message };
  }

  return null;
}

function isReconnectMessage(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("no canvas token") ||
    normalized.includes("canvas-token") ||
    normalized.includes("reconnect canvas") ||
    normalized.includes("invalid canvas api token") ||
    normalized.includes("invalid canvas token")
  );
}

/** True when the user must connect or reconnect Canvas for the requested institution. */
export function isCanvasConnectionRequiredError(error: unknown): boolean {
  const details = getConnectionErrorDetails(error);
  if (!details) {
    return false;
  }

  if (details.status !== 403 && details.status !== 422) {
    return false;
  }

  return isReconnectMessage(details.message);
}

/** User-facing copy for missing/invalid Canvas token errors (hides raw API paths). */
export function canvasConnectionRequiredMessage(error?: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    const normalized = error.message.toLowerCase();
    // Keep permission/admin guidance when Canvas truly refuses course create.
    if (
      normalized.includes("ask an admin") ||
      normalized.includes("grant course-creation")
    ) {
      return error.message;
    }
  }

  return "Canvas is not connected for this institution. Reconnect Canvas in Settings, then try again.";
}
