import { CanvasApiError } from "@/services/canvas";

/** True when the user must connect or reconnect Canvas for the requested institution. */
export function isCanvasConnectionRequiredError(error: unknown): boolean {
  if (!(error instanceof CanvasApiError)) {
    return false;
  }

  if (error.status !== 403) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    message.includes("no canvas token") ||
    message.includes("canvas-token") ||
    message.includes("reconnect canvas")
  );
}
