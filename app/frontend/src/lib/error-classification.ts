export type ErrorCategory = "canvas-auth" | "canvas-outage" | "generic";

/** Classifies a backend error message into a category so the UI can show a
 * distinct severity and, where there's a real fix, a suggested next step —
 * instead of every error rendering as the same small red line regardless of
 * cause. Matches the fixed phrasing integrations/canvas.py and services/canvas.py
 * actually raise (see e.g. "Invalid Canvas API token", "... reconnect Canvas."). */
export function classifyErrorMessage(message: string): ErrorCategory {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("reconnect canvas") ||
    normalized.includes("canvas api token") ||
    normalized.includes("canvas token") ||
    normalized.includes("lacks permission")
  ) {
    return "canvas-auth";
  }

  if (
    normalized.includes("timed out") ||
    normalized.includes("could not reach canvas") ||
    normalized.includes("canvas server error") ||
    normalized.includes("canvas api error")
  ) {
    return "canvas-outage";
  }

  return "generic";
}
