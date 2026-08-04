/**
 * Client-side loading stages for assistant chat.
 *
 * The chat API is request/response (no SSE progress), so stages are inferred
 * from the user message when possible and advanced on a timer while waiting.
 */

export type AssistantLoadingStage =
  | "thinking"
  | "connecting"
  | "analyzing"
  | "generating";

export const ASSISTANT_LOADING_COPY: Record<AssistantLoadingStage, string> = {
  thinking: "Thinking…",
  connecting: "Connecting to Canvas…",
  analyzing: "Analyzing data…",
  generating: "Generating response…",
};

/** Shown under the stage label when a reply takes longer than usual. */
export const LONG_WAIT_NOTE =
  "Taking longer than usual. You can stop and try again.";

/** Advance from the inferred stage to a generic generating stage. */
export const LOADING_STAGE_ADVANCE_MS = 2500;

/** Show the long-wait troubleshooting note after this delay. */
export const LOADING_NOTE_AFTER_MS = 8000;

const ANALYZE_PATTERN =
  /\b(analy[sz]e|analytics|missing|submission|late|grade|performance|engagement|who hasn'?t)\b/i;

const CANVAS_PATTERN =
  /\b(canvas|create|publish|sync|update|delete|assignment|quiz|course|module|announcement)\b/i;

export function inferAssistantLoadingStage(
  userText: string,
): AssistantLoadingStage {
  if (ANALYZE_PATTERN.test(userText)) {
    return "analyzing";
  }
  if (CANVAS_PATTERN.test(userText)) {
    return "connecting";
  }
  return "thinking";
}

export function nextAssistantLoadingStage(
  current: AssistantLoadingStage,
): AssistantLoadingStage {
  if (current === "generating") {
    return current;
  }
  return "generating";
}
