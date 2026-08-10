import { z } from "zod";

export const quizDescribeSchema = z.object({
  courseId: z.string().min(1, "Select a course"),
  prompt: z
    .string()
    .trim()
    .min(20, "Describe the quiz in a bit more detail (at least 20 characters)"),
});

export type QuizDescribeFormSchema = z.infer<typeof quizDescribeSchema>;

const quizAnswerSchema = z.object({
  text: z.string(),
  weight: z.number(),
});

const quizQuestionSchema = z
  .object({
    questionText: z.string().trim().min(1, "Question text cannot be empty"),
    questionType: z.enum([
      "multiple_choice_question",
      "true_false_question",
      "short_answer_question",
      "essay_question",
    ]),
    pointsPossible: z
      .number({ error: "Question points must be a number" })
      .positive("Question points must be greater than 0"),
    answers: z.array(quizAnswerSchema),
  })
  .superRefine((question, context) => {
    if (
      question.questionType !== "multiple_choice_question" &&
      question.questionType !== "true_false_question"
    ) {
      return;
    }

    if (
      question.questionType === "true_false_question" &&
      question.answers.length !== 2
    ) {
      context.addIssue({
        code: "custom",
        path: ["answers"],
        message: "True/false questions must have exactly 2 answers",
      });
      return;
    }

    if (
      question.questionType === "multiple_choice_question" &&
      question.answers.length < 2
    ) {
      context.addIssue({
        code: "custom",
        path: ["answers"],
        message: "Multiple-choice questions must have at least 2 answers",
      });
      return;
    }

    if (
      question.answers.some(
        (answer) => answer.weight !== 0 && answer.weight !== 100,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["answers"],
        message: "Answer weights must be 0 or 100",
      });
      return;
    }

    const correctCount = question.answers.filter(
      (answer) => answer.weight === 100,
    ).length;
    if (correctCount !== 1) {
      context.addIssue({
        code: "custom",
        path: ["answers"],
        message:
          "Mark exactly one correct answer (weight 100) and mark the rest incorrect (weight 0)",
      });
    }
  });

export const quizReviewSchema = z
  .object({
    name: z.string().trim().min(1, "Title cannot be empty"),
    description: z
      .string()
      .trim()
      .min(20, "Description must be at least 20 characters"),
    dueDate: z
      .string()
      .min(1, "Due date is required")
      .refine((value) => !Number.isNaN(new Date(value).getTime()), {
        message: "Due date must be a valid date",
      })
      .refine((value) => new Date(value).getTime() > Date.now(), {
        message: "Due date must be in the future",
      }),
    pointsPossible: z
      .number({ error: "Points possible is required" })
      .positive("Points possible must be greater than 0"),
    allowedAttempts: z.number().int().positive().nullable(),
    timeLimit: z.number().int().positive().nullable(),
    quizEngine: z.enum(["classic", "new_quizzes"]).default("classic"),
    questions: z.array(quizQuestionSchema),
    questionBankGroups: z
      .array(
        z.object({
          bankId: z.number().int().positive(),
          bankName: z.string().min(1),
          pickCount: z.number().int().positive("Pick count must be positive"),
          questionPoints: z
            .number()
            .positive("Question points must be positive"),
        }),
      )
      .default([]),
  })
  .superRefine((value, context) => {
    if (
      value.questions.length === 0 &&
      value.questionBankGroups.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["questions"],
        message: "Add at least one question or question bank group",
      });
    }

    const questionPoints = value.questions.reduce(
      (sum, question) => sum + question.pointsPossible,
      0,
    );
    const bankPoints = value.questionBankGroups.reduce(
      (sum, group) => sum + group.pickCount * group.questionPoints,
      0,
    );
    const scoredTotal = questionPoints + bankPoints;
    if (
      value.questions.length + value.questionBankGroups.length > 0 &&
      Math.abs(scoredTotal - value.pointsPossible) > 0.01
    ) {
      context.addIssue({
        code: "custom",
        path: ["pointsPossible"],
        message: `Points possible must equal the sum of question and bank points (${scoredTotal})`,
      });
    }

    if (
      value.quizEngine === "new_quizzes" &&
      value.questionBankGroups.length > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["questionBankGroups"],
        message: "Classic question banks cannot be used with New Quizzes",
      });
    }
  });

export type QuizReviewFormSchema = z.output<typeof quizReviewSchema>;
export type QuizReviewFormInput = z.input<typeof quizReviewSchema>;
