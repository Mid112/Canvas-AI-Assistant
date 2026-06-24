import { z } from "zod";

export const assignmentUpdateSchema = z.object({
  name: z.string().trim().min(1, "Title cannot be empty"),
  description: z.string(),
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

export type AssignmentUpdateFormSchema = z.infer<typeof assignmentUpdateSchema>;
