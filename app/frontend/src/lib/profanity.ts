/**
 * Small blocklist matching the backend safety net in
 * `app/services/message_validation.py` — not a full moderation product.
 */
const PROFANITY_PATTERN =
  /\b(fuck(?:ing|ed|er)?|shit(?:ty|s)?|asshole|bitch(?:es)?|cunt|dick(?:head)?|bastard|slut|whore)\b/i;

export function containsProfanity(text: string): boolean {
  return PROFANITY_PATTERN.test(text);
}

export const STUDENT_COMMUNICATION_PROFANITY_MESSAGE =
  "Feedback contains language that is not appropriate for student communication. Please revise and try again.";
