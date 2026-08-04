/** Detects a quiz request typed into the assignment creator.
 *
 * Instructors type quiz prompts into the assignment describe field ("Create a
 * quiz called 'recursion principles' with 5 multiple-choice questions..."), and
 * nothing noticed. The prompt went to the assignment draft generator, which
 * dutifully rendered the whole quiz — questions, options, points — as prose in
 * the assignment *description*. The result reads like a quiz but is an
 * assignment: no question items, nothing gradeable, nothing Canvas can
 * administer.
 *
 * This is deliberately a local heuristic rather than an LLM classification
 * call. It runs on every keystroke, so latency and cost matter more than
 * precision, and the consequence of a false positive is one dismissible
 * banner. A false negative just leaves today's behaviour.
 */

/** Naming a quiz outright is enough on its own. */
const EXPLICIT = /\bquiz(?:zes|zed)?\b/i;

/** Quiz shape without the word — any two of these together are persuasive. */
const SHAPE_SIGNALS: RegExp[] = [
  /\bmultiple[-\s]?choice\b/i,
  /\btrue[\s/]?(?:or\s+)?false\b/i,
  /\b\d+\s+questions?\b/i,
  /\b\d+\s+(?:answer\s+)?(?:options|choices)\b/i,
  /\btime\s+limit\b/i,
  /\ballowed\s+attempts?\b/i,
  /\bcorrect\s+answer\b/i,
  /\bpoints?\s+(?:per|each)\s+question\b/i,
];

/** True when the prompt reads like a quiz rather than an assignment. */
export function looksLikeQuizRequest(prompt: string): boolean {
  const text = prompt.trim();
  // Short fragments produce noisy matches while the instructor is still typing.
  if (text.length < 15) {
    return false;
  }
  if (EXPLICIT.test(text)) {
    return true;
  }
  const matched = SHAPE_SIGNALS.reduce(
    (count, pattern) => (pattern.test(text) ? count + 1 : count),
    0,
  );
  return matched >= 2;
}
