// Messages UI note: supports the instructor message-drafting flow for message draft schema without bypassing preview/confirmation.

import { z } from "zod";

export const messageDraftSchema = z.object({
  subject: z.string().trim().min(1, "Subject is required"),
  body: z
    .string()
    .trim()
    .min(1, "Message body is required")
    .max(5000, "Message body must be 5,000 characters or fewer"),
});

export type MessageDraftFormSchema = z.infer<typeof messageDraftSchema>;
