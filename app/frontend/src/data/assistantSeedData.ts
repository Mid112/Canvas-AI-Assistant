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
 * Suggested-action prompts, built from the instructor's real active course
 * instead of a hardcoded course/assignment name. Previously these were a
 * static array with fabricated identifiers baked in (e.g. "Assignment 3",
 * "COSC 499") that didn't correspond to anything in the instructor's
 * actual data, so clicking one sent a request about a course or
 * assignment that didn't exist. courseLabel is omitted (falling back to a
 * generic prompt) when there's no active course yet, letting the
 * assistant's own clarify flow ask which course rather than guessing one.
 */
export function buildSuggestedActions(courseLabel?: string): SuggestedAction[] {
  const forCourse = courseLabel ? ` for ${courseLabel}` : "";
  const inCourse = courseLabel ? ` in ${courseLabel}` : "";

  return [
    {
      id: "missing-submissions",
      title: "Show missing submissions",
      description: "View all missing assignments across courses",
      prompt: `Show missing submissions${forCourse}`,
    },
    {
      id: "summarize-quiz",
      title: "Summarize quiz results",
      description: "Get a performance summary for a recent quiz",
      prompt: `Summarize the most recent quiz results${forCourse}`,
    },
    {
      id: "late-assignments",
      title: "Show late assignments",
      description: "Find students with overdue work",
      prompt: `Show late assignments${inCourse}`,
    },
    {
      id: "course-performance",
      title: "View course performance",
      description: "See overall course analytics",
      prompt: `View course performance${forCourse}`,
    },
  ];
}
