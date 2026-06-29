import type { MessageTemplate } from "@/types/messageDraft";

export const mockMessageRecipients = [
  {
    id: "student-1",
    name: "Alex Thompson",
    email: "alex.t@university.edu",
  },
  {
    id: "student-2",
    name: "Maria Garcia",
    email: "maria.g@university.edu",
  },
  {
    id: "student-3",
    name: "John Smith",
    email: "john.smith@university.edu",
  },
  {
    id: "student-4",
    name: "Sarah Lee",
    email: "sarah.lee@university.edu",
  },
  {
    id: "student-5",
    name: "Emily Johnson",
    email: "emily.johnson@university.edu",
  },
] as const;

export const mockMessageTemplates: MessageTemplate[] = [
  {
    id: "assignment-reminder",
    name: "Assignment Reminder",
    description: "Remind students about upcoming or overdue assignments",
  },
  {
    id: "encouragement",
    name: "Encouragement",
    description: "Send motivational messages to keep students engaged",
  },
  {
    id: "course-announcement",
    name: "Course Announcement",
    description: "Share important updates with your class",
  },
  {
    id: "grade-feedback",
    name: "Grade Feedback",
    description: "Provide personalized feedback on student work",
  },
];

export const mockMessageDraft = {
  id: "draft-assignment-reminder-001",
  recipients: [...mockMessageRecipients],
  subject: "Reminder: Programming Assignment 3 Due Friday",
  body: `Hi everyone,

This is a friendly reminder that Programming Assignment 3 is due this Friday at 11:59 PM.

Please make sure you have:
• Completed all required functions
• Included unit tests for your code
• Submitted through the Canvas assignment portal

If you have questions or need an extension, please reach out before the deadline.

Best regards,
Dr. Jane Doe`,
  templateName: "Assignment Reminder",
  templateId: "assignment-reminder",
};

export const emptyRecipientsMessageDraft = {
  id: "draft-empty-recipients",
  recipients: [],
  subject: "Course Announcement",
  body: "No recipients have been selected for this message draft.",
  templateName: "Course Announcement",
  templateId: "course-announcement",
};
