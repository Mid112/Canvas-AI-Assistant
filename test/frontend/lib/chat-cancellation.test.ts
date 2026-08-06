import { describe, expect, it } from "vitest";

import {
  isCancellationPhrase,
  normalizeCancellationText,
} from "@/lib/chat-cancellation";

describe("normalizeCancellationText", () => {
  it("lowercases, strips apostrophes and punctuation, and collapses whitespace", () => {
    expect(normalizeCancellationText("  Never  mind! ")).toBe("never mind");
    expect(normalizeCancellationText("Don't do that.")).toBe("dont do that");
  });
});

describe("isCancellationPhrase", () => {
  it("recognizes common dismissal phrases", () => {
    for (const phrase of [
      "never mind",
      "Never mind.",
      "nevermind",
      "nvm",
      "forget it",
      "cancel",
      "cancel that",
      "no thanks",
      "scratch that",
      "disregard",
      "stop",
      "don't do that",
    ]) {
      expect(isCancellationPhrase(phrase)).toBe(true);
    }
  });

  it("does not treat genuine follow-up requests as cancellations", () => {
    for (const phrase of [
      "cancel the midterm assignment",
      "never mind the due date, change the points",
      "can you make it open book",
      "stop words should be removed from the quiz",
      "",
      "   ",
    ]) {
      expect(isCancellationPhrase(phrase)).toBe(false);
    }
  });
});
