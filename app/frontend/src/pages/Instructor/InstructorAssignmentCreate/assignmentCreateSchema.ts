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
  name: z
    .string()
    .trim()
    .min(1, "Title cannot be empty. Enter a title before submitting."),
  description: z
    .string()
    .trim()
    .min(
      1,
      "Description cannot be empty. Add a short description of what students should do.",
    ),
  dueDate: z
    .string()
    .min(1, "Due date is required. Set a due date before creating.")
    .refine((value) => !Number.isNaN(new Date(value).getTime()), {
      message: "Due date must be a valid date. Use the date picker and try again.",
    })
    .refine((value) => new Date(value).getTime() > Date.now(), {
      message: "Due date must be in the future. Choose a date and time after now.",
    }),
  // Ticket 21: null/empty = ungraded. Never invent a default like 10 or 100.
  pointsPossible: z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) {
      return null;
    }
    if (typeof value === "number" && Number.isNaN(value)) {
      return null;
    }
    return value;
  }, z
    .number({ error: "Points possible must be a number when provided." })
    .positive(
      "Points possible must be greater than 0. Enter a positive point value, or leave blank for ungraded.",
    )
    .nullable()),
});

/** Form values after Zod coercion/validation (submit payload). */
export type AssignmentReviewFormSchema = z.output<typeof assignmentReviewSchema>;
/** Form values before coercion (HTML inputs may supply strings). */
export type AssignmentReviewFormInput = z.input<typeof assignmentReviewSchema>;
