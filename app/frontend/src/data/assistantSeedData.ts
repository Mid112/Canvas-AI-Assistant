import type { ChatMessage, SuggestedAction } from "@/types/chat";

export const seedChatMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "Hello! I'm your Canvas AI Assistant. I can help you manage courses, create assignments, analyze student performance, and much more. How can I assist you today?",
    timestamp: new Date("2026-06-24T10:00:00"),
  },
];

export const suggestedActions: SuggestedAction[] = [
  {
    id: "missing-submissions",
    title: "Show missing submissions",
    description: "View all missing assignments across courses",
    prompt: "Show missing submissions for Assignment 3",
  },
  {
    id: "summarize-quiz",
    title: "Summarize Quiz 2",
    description: "Get a performance summary for Quiz 2",
    prompt: "Summarize Quiz 2 results for COSC 499",
  },
  {
    id: "late-assignments",
    title: "Show late assignments",
    description: "Find students with overdue work",
    prompt: "Show late assignments in COSC 499",
  },
  {
    id: "course-performance",
    title: "View course performance",
    description: "See overall course analytics",
    prompt: "View course performance for COSC 499",
  },
];
