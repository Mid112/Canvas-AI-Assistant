import { z } from "zod";

import {
  STUDENT_COMMUNICATION_PROFANITY_MESSAGE,
  containsProfanity,
} from "@/lib/profanity";

export const feedbackDescribeSchema = z.object({
  courseId: z.string().min(1, "Select a course"),
  assignmentId: z.string().min(1, "Select an assignment"),
  studentId: z.string().min(1, "Select a student"),
  prompt: z
    .string()
    .trim()
    .min(20, "Describe the feedback in a bit more detail (at least 20 characters)"),
});

export type FeedbackDescribeFormSchema = z.infer<typeof feedbackDescribeSchema>;

export const feedbackReviewSchema = z.object({
  assignmentName: z.string().trim().min(1, "Assignment is required"),
  studentName: z.string().trim().min(1, "Student is required"),
  newGrade: z.string().trim().min(1, "Grade is required"),
  feedback: z
    .string()
    .trim()
    .min(1, "Feedback comment is required")
    .refine((value) => !containsProfanity(value), {
      message: STUDENT_COMMUNICATION_PROFANITY_MESSAGE,
    }),
});

export type FeedbackReviewFormSchema = z.infer<typeof feedbackReviewSchema>;
