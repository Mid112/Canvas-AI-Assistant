import { describe, expect, it } from "vitest";

import { quizGradebookAssignmentId } from "@/services/quizzes";
import type { Quiz } from "@/types/quiz";

function quiz(overrides: Partial<Quiz> = {}): Quiz {
  return {
    id: 5,
    assignment_id: 99,
    title: "Quiz",
    description: null,
    due_at: null,
    points_possible: 10,
    course_id: 1,
    quiz_type: "assignment",
    allowed_attempts: 1,
    time_limit: null,
    published: false,
    question_count: 1,
    html_url: null,
    quiz_engine: "classic",
    ...overrides,
  };
}

describe("quizGradebookAssignmentId", () => {
  it("uses linked assignment_id for classic quizzes", () => {
    expect(quizGradebookAssignmentId(quiz())).toBe(99);
  });

  it("falls back to id for New Quizzes", () => {
    expect(
      quizGradebookAssignmentId(
        quiz({
          id: 77,
          assignment_id: null,
          quiz_engine: "new_quizzes",
        }),
      ),
    ).toBe(77);
  });

  it("returns null when a classic quiz has no gradebook assignment", () => {
    expect(quizGradebookAssignmentId(quiz({ assignment_id: null }))).toBeNull();
  });
});
