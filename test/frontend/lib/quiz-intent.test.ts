import { describe, expect, it } from "vitest";

import { looksLikeQuizRequest } from "@/lib/quiz-intent";

describe("looksLikeQuizRequest", () => {
  // The exact prompt from the bug report: typed into the assignment creator,
  // it produced an assignment whose *description* was a rendered quiz.
  it("detects the reported prompt", () => {
    expect(
      looksLikeQuizRequest(
        "Create a quiz called 'recursion principles' with 5 multiple-choice " +
          "questions about cell biology. Each question should have 4 options. " +
          "Set it to 50 points total, with a 30-minute time limit.",
      ),
    ).toBe(true);
  });

  it("detects quiz shape even without the word 'quiz'", () => {
    expect(
      looksLikeQuizRequest(
        "Give me 10 questions about photosynthesis, each with 4 options and a 20 minute time limit.",
      ),
    ).toBe(true);
  });

  it("needs more than one weak signal", () => {
    // "5 questions" alone is a normal thing to say about an assignment.
    expect(
      looksLikeQuizRequest(
        "Write an essay assignment with 5 questions students must address in their paper.",
      ),
    ).toBe(false);
  });

  it("leaves ordinary assignment prompts alone", () => {
    expect(
      looksLikeQuizRequest(
        "Create a programming assignment about arrays and sorting algorithms " +
          "for beginner students, worth 100 points.",
      ),
    ).toBe(false);
  });

  // Fires on every keystroke, so a half-typed word must not flash the banner.
  it("ignores short fragments", () => {
    expect(looksLikeQuizRequest("qui")).toBe(false);
    expect(looksLikeQuizRequest("a quiz")).toBe(false);
    expect(looksLikeQuizRequest("   ")).toBe(false);
  });
});
