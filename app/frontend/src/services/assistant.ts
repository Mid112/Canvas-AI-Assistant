import type { AssistantResponse } from "@/types/chat";

export class AssistantApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantApiError";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function randomDelayMs(): number {
  return 1000 + Math.floor(Math.random() * 1000);
}

// Placeholder mock response routing — delete and replace with real backend/LLM
// integration once the frontend sends messages to the API.
function buildMockResponse(message: string): AssistantResponse {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("missing") ||
    normalized.includes("reminder") ||
    normalized.includes("submission")
  ) {
    return {
      content:
        "I found students who have not submitted the assignment yet. I can help you send a reminder if you'd like.",
      explanation:
        "I analyzed submission data and identified students who have not submitted Assignment 3.",
      interpretedAction: {
        action: "Send Reminder",
        course: "COSC 499",
        affectedStudents: "12 students",
      },
    };
  }

  if (normalized.includes("quiz") || normalized.includes("summarize")) {
    return {
      content:
        "Quiz 2 had an average score of 78%. Most students performed well on questions 1–3, while question 4 had the lowest scores.",
      explanation:
        "I reviewed gradebook data and grouped results by question to highlight areas where students struggled.",
    };
  }

  if (normalized.includes("late") || normalized.includes("overdue")) {
    return {
      content:
        "There are 5 late assignments in COSC 499. Would you like me to draft reminder messages for those students?",
      explanation:
        "I compared due dates against submission timestamps to identify overdue work.",
      interpretedAction: {
        action: "Draft Reminders",
        course: "COSC 499",
        affectedStudents: "5 students",
      },
    };
  }

  return {
    content:
      "I can help with course management, assignments, announcements, and student performance. Try asking about missing submissions, quiz summaries, or late assignments.",
  };
}

/** Mock assistant API — simulates network delay and optional failure. */
export async function sendAssistantMessage(
  message: string,
): Promise<AssistantResponse> {
  await delay(randomDelayMs());

  if (message.toLowerCase().includes("fail please")) {
    throw new AssistantApiError(
      "The assistant is temporarily unavailable. Please try again.",
    );
  }

  return buildMockResponse(message);
}
