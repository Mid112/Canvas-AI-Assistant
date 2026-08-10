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
 * First-time quick actions for the empty chat state (#1441 / Ticket 17).
 *
 * Ids are the dashboard's, so each button reaches the same destination as its
 * Quick AI Actions twin — resolveQuickAction owns that mapping. This list only
 * decides which four of the five appear here, and how they are labelled.
 *
 * Keep exactly four so the 2×2 grid stays balanced, covering assignments,
 * quizzes, missing submissions, and messages.
 */
export function buildSuggestedActions(): SuggestedAction[] {
  return [
    {
      id: "create-assignment",
      title: "Create an assignment",
      description: "Draft a new assignment with AI",
    },
    {
      id: "create-quiz",
      title: "Create a quiz",
      description: "Start a quiz from a short description",
    },
    {
      // Titled exactly as the dashboard does. The old label ("Analyze course
      // performance") promised a broader analysis than the action behind it
      // performs, which is specifically the missing-submissions read (#12).
      id: "analyse-missing-submissions",
      title: "Analyse Missing Submissions",
      description: "See who hasn't submitted",
    },
    {
      // Its own id, not the dashboard's "draft-announcement": the two labels
      // promise different sends, so sharing an id meant one of them was always
      // lying about what the button does.
      id: "draft-student-message",
      title: "Draft a student message",
      description: "Message students in your active course",
    },
  ];
}
