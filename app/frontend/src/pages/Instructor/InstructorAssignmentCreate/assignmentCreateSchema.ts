import { z } from "zod";

export const assignmentDescribeSchema = z.object({
  courseId: z.string().min(1, "Select a course"),
  prompt: z
    .string()
    .trim()
    .min(20, "Describe the assignment in a bit more detail (at least 20 characters)"),
});

export type AssignmentDescribeFormSchema = z.infer<typeof assignmentDescribeSchema>;

export const assignmentReviewSchema = z.object({
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
});

export type AssignmentReviewFormSchema = z.infer<typeof assignmentReviewSchema>;
