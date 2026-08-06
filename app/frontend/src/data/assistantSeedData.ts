// Mock data note: supplies assistant seed data fixtures for UI development and frontend tests.

import type { ChatMessage, SuggestedAction } from "@/types/chat";

export const seedChatMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "Hello! I'm your Canvas AI Assistant. I can help you manage courses, create assignments, analyze student performance, and much more. Every write action requires your preview and approval before it is published to Canvas. How can I assist you today?",
    timestamp: new Date("2026-06-24T10:00:00"),
  },
];

/**
 * First-time starter prompts for the empty chat state (#1441 / Ticket 17).
 *
 * Built from the instructor's real active course instead of hardcoded
 * fabricated names. courseLabel is omitted (generic prompt) when there's no
 * active course yet so the assistant can clarify rather than guess.
 *
 * Keep exactly four actions so the 2×2 starter grid stays balanced and covers
 * assignments, quizzes, analytics, and messages.
 */
export function buildSuggestedActions(courseLabel?: string): SuggestedAction[] {
  const forCourse = courseLabel ? ` for ${courseLabel}` : "";
  const inCourse = courseLabel ? ` in ${courseLabel}` : "";

  return [
    {
      id: "create-assignment",
      title: "Create an assignment",
      description: "Draft a new assignment with AI",
      prompt: `Help me create an assignment${inCourse}. Ask for any missing details, then propose a create_assignment preview I can review.`,
    },
    {
      id: "create-quiz",
      title: "Create a quiz",
      description: "Start a quiz from a short description",
      prompt: `Help me create a quiz${inCourse}. Propose a create_quiz preview I can review in the quiz creator.`,
    },
    {
      id: "course-analytics",
      title: "Analyze course performance",
      description: "See submissions and analytics",
      prompt: `Show missing submissions and course performance${forCourse}`,
    },
    {
      id: "draft-student-message",
      title: "Draft a student message",
      description: "Write a message or announcement with AI",
      prompt: `Draft a message to students${inCourse} about an upcoming deadline. Propose a send_message action I can review and edit before sending.`,
    },
  ];
}
