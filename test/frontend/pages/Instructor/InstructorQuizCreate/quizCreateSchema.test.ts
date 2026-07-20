import { describe, expect, it } from "vitest";

import {
  quizDescribeSchema,
  quizReviewSchema,
} from "@/pages/Instructor/InstructorQuizCreate/quizCreateSchema";

describe("quizCreateSchema", () => {
  it("requires a course and useful description", () => {
    expect(
      quizDescribeSchema.safeParse({ courseId: "", prompt: "short" }).success,
    ).toBe(false);
  });

  it("accepts a complete editable quiz", () => {
    const result = quizReviewSchema.safeParse({
      name: "Recursion Quiz",
      description: "Covers base cases and recursive definitions.",
      dueDate: "2030-12-15T23:59",
      pointsPossible: 5,
      allowedAttempts: 2,
      timeLimit: 30,
      questions: [
        {
          questionText: "What is a base case?",
          questionType: "essay_question",
          pointsPossible: 5,
          answers: [],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects short quiz descriptions", () => {
    const result = quizReviewSchema.safeParse({
      name: "Recursion Quiz",
      description: "quiz",
      dueDate: "2030-12-15T23:59",
      pointsPossible: 5,
      allowedAttempts: 1,
      timeLimit: null,
      questions: [
        {
          questionText: "What is a base case?",
          questionType: "essay_question",
          pointsPossible: 5,
          answers: [],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects quizzes with no questions or banks", () => {
    const result = quizReviewSchema.safeParse({
      name: "Recursion Quiz",
      description: "Covers base cases and recursive definitions.",
      dueDate: "2030-12-15T23:59",
      pointsPossible: 20,
      allowedAttempts: 1,
      timeLimit: null,
      questions: [],
      questionBankGroups: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects mismatched quiz and question point totals", () => {
    const result = quizReviewSchema.safeParse({
      name: "Recursion Quiz",
      description: "Covers base cases and recursive definitions.",
      dueDate: "2030-12-15T23:59",
      pointsPossible: 100,
      allowedAttempts: 1,
      timeLimit: null,
      questions: [
        {
          questionText: "What is a base case?",
          questionType: "essay_question",
          pointsPossible: 5,
          answers: [],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects past dates and invalid question points", () => {
    const result = quizReviewSchema.safeParse({
      name: "Recursion Quiz",
      description: "Covers base cases and recursive definitions.",
      dueDate: "2020-01-01T00:00",
      pointsPossible: 5,
      allowedAttempts: null,
      timeLimit: null,
      questions: [
        {
          questionText: "What is a base case?",
          questionType: "essay_question",
          pointsPossible: 0,
          answers: [],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects true/false questions without exactly one correct answer", () => {
    const result = quizReviewSchema.safeParse({
      name: "Recursion Quiz",
      description: "Covers base cases and recursive definitions.",
      dueDate: "2030-12-15T23:59",
      pointsPossible: 5,
      allowedAttempts: 1,
      timeLimit: null,
      questions: [
        {
          questionText: "Recursion needs a base case?",
          questionType: "true_false_question",
          pointsPossible: 5,
          answers: [
            { text: "True", weight: 0 },
            { text: "False", weight: 0 },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("keeps Classic question banks out of New Quizzes", () => {
    const result = quizReviewSchema.safeParse({
      name: "Recursion Quiz",
      description: "Covers base cases and recursive definitions.",
      dueDate: "2030-12-15T23:59",
      pointsPossible: 10,
      allowedAttempts: 1,
      timeLimit: null,
      quizEngine: "new_quizzes",
      questions: [],
      questionBankGroups: [
        {
          bankId: 31,
          bankName: "Recursion Bank",
          pickCount: 5,
          questionPoints: 2,
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
