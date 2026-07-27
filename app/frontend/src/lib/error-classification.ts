export type ErrorCategory =
  | "canvas-auth"
  | "canvas-outage"
  | "duplicate-in-flight"
  | "validation"
  | "generic";

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

  if (
    normalized.includes("already in progress") ||
    normalized.includes("already running") ||
    normalized.includes("duplicate") ||
    normalized.includes("in-flight") ||
    normalized.includes("another canvas write")
  ) {
    return "duplicate-in-flight";
  }

  if (
    normalized.includes("concluded") ||
    normalized.includes("read-only") ||
    normalized.includes("required") ||
    normalized.includes("invalid") ||
    normalized.includes("enter a") ||
    normalized.includes("cannot be empty")
  ) {
    return "validation";
  }

  return "generic";
}

export function recoverySuggestionForCategory(category: ErrorCategory): string | null {
  switch (category) {
    case "canvas-auth":
      return "Reconnect Canvas in Settings, then retry this action.";
    case "canvas-outage":
      return "This is usually temporary — wait a moment and try again.";
    case "duplicate-in-flight":
      return "Wait for the running write to finish, or pause/cancel it, then retry.";
    case "validation":
      return "Fix the highlighted fields or pick a writable course, then try again.";
    default:
      return "Review the message above, then retry or adjust your request.";
  }
}
