import type { DryRunPreviewData } from "@/types/dryRunPreview";

const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

export const mockStudentReminderPreview: DryRunPreviewData = {
  id: "workflow-student-reminder",
  title: "Workflow Preview",
  subtitle: "Review AI-generated actions before execution",
  originalRequest:
    'Send a reminder email to all students in CS 101 who haven\'t submitted Programming Assignment 3. Include the due date and a link to the assignment.',
  requestedBy: "Dr. Jane Doe",
  requestedAt: twoMinutesAgo,
  summary:
    "Send personalized reminder emails to students who have not submitted Programming Assignment 3.",
  actionType: "Send Message",
  aiExplanation: [
    "Query Canvas API to identify students who have not submitted Programming Assignment 3.",
    "Generate personalized reminder emails for each student with their name and assignment details.",
    "Create draft messages in Canvas Conversations for your review before sending.",
  ],
  aiExplanationNote:
    "Messages will be created as drafts. You'll have a final opportunity to review before they're sent to students.",
  apiOperations: [
    { method: "GET", endpoint: "/assignments/submissions" },
    { method: "POST", endpoint: "/conversations" },
  ],
  affectedResources: {
    course: {
      name: "CS 101: Introduction to Programming",
      id: "course-101",
    },
    assignment: {
      name: "Programming Assignment 3: Loops",
      id: "assignment-3",
      dueDate: "March 15, 2026 at 11:59 PM",
    },
    students: [
      { id: "s1", name: "Alex Johnson", email: "alex.johnson@university.edu" },
      { id: "s2", name: "Maria Garcia", email: "maria.garcia@university.edu" },
      { id: "s3", name: "James Wilson", email: "james.wilson@university.edu" },
      { id: "s4", name: "Sarah Chen", email: "sarah.chen@university.edu" },
      { id: "s5", name: "David Kim", email: "david.kim@university.edu" },
    ],
  },
  reversibility: "irreversible",
  reversibilityExplanation:
    "This workflow will make changes to your Canvas course. Please carefully review all affected entities and the generated queries before approving. This action cannot be undone automatically.",
};

export const mockAssignmentUpdatePreview: DryRunPreviewData = {
  id: "workflow-assignment-update",
  title: "Assignment Update Preview",
  subtitle: "Review proposed Canvas changes before execution",
  originalRequest:
    "Update the due date for Milestone 2 Demo to July 10 at 11:59 PM for all enrolled students.",
  requestedBy: "Dr. Jane Doe",
  requestedAt: twoMinutesAgo,
  summary:
    "This action will update the due date of the assignment 'Milestone 2 Demo' for all enrolled students.",
  actionType: "Update",
  aiExplanation: [
    "Locate the assignment 'Milestone 2 Demo' in COSC 499 Capstone.",
    "Update the due date to July 10, 11:59 PM in the course timezone.",
    "Notify enrolled students of the updated due date via Canvas.",
  ],
  apiOperations: [
    { method: "GET", endpoint: "/courses/:course_id/assignments/:id" },
    { method: "PUT", endpoint: "/courses/:course_id/assignments/:id" },
  ],
  affectedResources: {
    course: {
      name: "COSC 499 Capstone",
      id: "course-499",
    },
    assignment: {
      name: "Milestone 2 Demo",
      id: "assignment-milestone-2",
      dueDate: "July 10, 11:59 PM",
    },
    students: { count: 124 },
    sections: { count: 2 },
  },
  reversibility: "partially-reversible",
  reversibilityExplanation:
    "The due date can be changed again later, but students may already have been notified of the update.",
};

export const mockDryRunPreviews: Record<string, DryRunPreviewData> = {
  [mockStudentReminderPreview.id]: mockStudentReminderPreview,
  [mockAssignmentUpdatePreview.id]: mockAssignmentUpdatePreview,
};

export const defaultDryRunPreviewId = mockStudentReminderPreview.id;
