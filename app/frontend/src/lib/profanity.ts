/**
 * Small blocklist matching the backend safety net in
 * `app/services/profanity.py` — not a full moderation product.
 * Text is normalized (accents / lookalikes / zero-width / spaced letters)
 * before matching so common bypass tricks still hit the filter.
 */
const PROFANITY_BODY =
  "fuck(?:ing|ed|ers?|s)?|shit(?:ty|s)?|assholes?|bitch(?:es)?|cunts?|dick(?:heads?|s)?|bastards?|sluts?|whores?";
const PROFANITY_PATTERN = new RegExp(`\\b(${PROFANITY_BODY})\\b`, "i");

const HOMOGLYPHS: Record<string, string> = {
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  у: "y",
  х: "x",
  і: "i",
  ї: "i",
  ё: "e",
  ѕ: "s",
  ј: "j",
};

// Alternation (not a character class) — eslint no-misleading-character-class
// flags ZWJ/ZWNJ inside `[]` because they can join grapheme clusters.
const ZERO_WIDTH = /\u200b|\u200c|\u200d|\ufeff|\u00ad/g;
const SPACED_LETTERS = /(?<![a-z0-9])([a-z](?:[\s._-]+[a-z])+)(?![a-z0-9])/g;

function normalizeForProfanity(text: string): string {
  const decomposed = text.normalize("NFKD");
  let folded = "";
  for (const char of decomposed) {
    // Skip combining marks (accents) after NFKD.
    if (/\p{M}/u.test(char)) continue;
    const lower = char.toLowerCase();
    folded += HOMOGLYPHS[lower] ?? lower;
  }
  return folded.replace(ZERO_WIDTH, "");
}

function collapseSpacedLetters(text: string): string {
  return text.replace(SPACED_LETTERS, (match) => match.replace(/[^a-z]/g, ""));
}

export function containsProfanity(text: string): boolean {
  if (!text) return false;
  const normalized = collapseSpacedLetters(normalizeForProfanity(text));
  return PROFANITY_PATTERN.test(normalized);
}

export const STUDENT_COMMUNICATION_PROFANITY_MESSAGE =
  "Feedback contains language that is not appropriate for student communication. Please revise and try again.";
