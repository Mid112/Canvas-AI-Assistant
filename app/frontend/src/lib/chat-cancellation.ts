/**
 * Detects short "dismissal" phrases (e.g. "never mind") that a user types to
 * back out of a pending assistant action. When one of these is sent while an
 * action is awaiting confirmation, the chat should cleanly cancel the proposal
 * instead of forwarding the text to the LLM as a modification (which can
 * produce a malformed-response error rather than a clean cancellation).
 *
 * Matching is intentionally conservative: only exact, normalized phrases count
 * so that genuine follow-up requests (e.g. "cancel the midterm assignment")
 * are still treated as normal messages.
 */
const CANCELLATION_PHRASES = new Set<string>([
  "never mind",
  "nevermind",
  "nvm",
  "forget it",
  "forget that",
  "cancel",
  "cancel that",
  "cancel it",
  "cancel this",
  "cancel the action",
  "no thanks",
  "no thank you",
  "no thankyou",
  "scratch that",
  "disregard",
  "disregard that",
  "stop",
  "stop it",
  "dont do it",
  "dont do that",
  "do not do it",
  "do not do that",
  "actually never mind",
  "actually nevermind",
  "leave it",
]);

/** Lowercases, strips apostrophes/punctuation, and collapses whitespace. */
export function normalizeCancellationText(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[.!?,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true when the message is a standalone cancellation/dismissal phrase.
 */
export function isCancellationPhrase(text: string): boolean {
  const normalized = normalizeCancellationText(text);
  if (!normalized) {
    return false;
  }
  return CANCELLATION_PHRASES.has(normalized);
}
