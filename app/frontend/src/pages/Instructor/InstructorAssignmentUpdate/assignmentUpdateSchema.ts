// Instructor page note: coordinates assignment update schema UI state with Canvas-backed services and active-course context.

import { z } from "zod";

export const assignmentUpdateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Title cannot be empty. Enter a title before saving."),
  // Blank description is intentional — sent as null to clear/leave optional.
  description: z.string(),
  dueDate: z
    .string()
    .min(1, "Due date is required. Set a due date before saving.")
    .refine((value) => !Number.isNaN(new Date(value).getTime()), {
      message: "Due date must be a valid date. Use the date picker and try again.",
    })
    .refine((value) => new Date(value).getTime() > Date.now(), {
      message: "Due date must be in the future. Choose a date and time after now.",
    }),
});

export type AssignmentUpdateFormSchema = z.infer<typeof assignmentUpdateSchema>;
