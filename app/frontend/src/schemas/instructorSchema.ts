import { z } from "zod";

export const instructorFormSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z
    .string()
    .trim()
    .min(1, "Email address is required")
    .email("Enter a valid email address"),
  temporaryPassword: z
    .string()
    .min(8, "Temporary password must be at least 8 characters"),
});

export const editInstructorFormSchema = instructorFormSchema.omit({
  temporaryPassword: true,
});

export type InstructorFormValues = z.infer<typeof instructorFormSchema>;
export type EditInstructorFormValues = z.infer<typeof editInstructorFormSchema>;
