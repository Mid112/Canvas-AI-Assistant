import { z } from "zod";

export const quizDescribeSchema = z.object({
  courseId: z.string().min(1, "Select a course"),
  prompt: z
    .string()
    .trim()
    .min(20, "Describe the quiz in a bit more detail (at least 20 characters)"),
});

export type QuizDescribeFormSchema = z.infer<typeof quizDescribeSchema>;

const quizQuestionSchema = z.object({
  questionText: z.string().trim().min(1, "Question text cannot be empty"),
  questionType: z.enum([
    "multiple_choice_question",
    "true_false_question",
    "short_answer_question",
    "essay_question",
  ]),
  pointsPossible: z.number().positive("Question points must be greater than 0"),
  answers: z.array(
    z.object({
      text: z.string(),
      weight: z.number(),
    }),
  ),
});

export const quizReviewSchema = z.object({
  name: z.string().trim().min(1, "Title cannot be empty"),
  description: z.string().trim().min(1, "Description cannot be empty"),
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
  questions: z.array(quizQuestionSchema),
});

export type QuizReviewFormSchema = z.output<typeof quizReviewSchema>;
export type QuizReviewFormInput = z.input<typeof quizReviewSchema>;
