import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ActionCard } from "@/components/chat/ActionCard";
import { AssistantMessage } from "@/components/chat/AssistantMessage";
import { ExplanationCard } from "@/components/chat/ExplanationCard";

describe("ExplanationCard", () => {
  // Verifies: Renders the explanation text.
  it("renders the explanation text", () => {
    render(
      <ExplanationCard explanation="I analyzed submission data and identified students who have not submitted Assignment 3." />,
    );

    expect(screen.getByText("Explanation")).toBeInTheDocument();
    expect(
      screen.getByText(/identified students who have not submitted Assignment 3/),
    ).toBeInTheDocument();
  });
});

describe("ActionCard", () => {
  // Verifies: Renders interpreted action details.
  it("renders interpreted action details", () => {
    render(
      <MemoryRouter>
        <ActionCard
          action={{
          action: "Send Reminder",
          course: "COSC 499",
          affectedStudents: "12 students",
        }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Interpreted Action")).toBeInTheDocument();
    expect(screen.getByText("Send Reminder")).toBeInTheDocument();
    expect(screen.getByText("COSC 499")).toBeInTheDocument();
    expect(screen.getByText("12 students")).toBeInTheDocument();
  });

  // Verifies: Renders action links when provided.
  it("renders action links when provided", () => {
    render(
      <MemoryRouter>
        <ActionCard
          action={{
            action: "Send Reminder",
            course: "COSC 499",
            affectedStudents: "12 students",
            primaryLink: {
              label: "Preview workflow",
              href: "/instructor/actions/preview?preview=workflow-student-reminder",
            },
          }}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("link", { name: /Preview workflow/i }),
    ).toBeInTheDocument();
  });
});

describe("AssistantMessage", () => {
  // Verifies: Renders explanation and action cards when provided.
  it("renders explanation and action cards when provided", () => {
    render(
      <AssistantMessage
        message={{
          id: "1",
          role: "assistant",
          content: "I found missing submissions.",
          timestamp: new Date("2026-06-24T10:00:00"),
          explanation:
            "I analyzed submission data and identified students who have not submitted Assignment 3.",
          interpretedAction: {
            action: "Send Reminder",
            course: "COSC 499",
            affectedStudents: "12 students",
          },
        }}
      />,
    );

    expect(screen.getByText("I found missing submissions.")).toBeInTheDocument();
    expect(screen.getByText("Explanation")).toBeInTheDocument();
    expect(screen.getByText("Interpreted Action")).toBeInTheDocument();
  });

  // Verifies: Renders a safety notice when the request was blocked.
  it("renders a safety notice when the request was blocked", () => {
    render(
      <AssistantMessage
        message={{
          id: "2",
          role: "assistant",
          content: "I cannot complete that request.",
          timestamp: new Date("2026-06-24T10:05:00"),
          safetyBlocked: true,
          safetyMessage: "Please include the course and assignment details.",
        }}
      />,
    );

    expect(
      screen.getByText("Please include the course and assignment details."),
    ).toBeInTheDocument();
  });

  it("hides handoff cards after dismiss and shows cancelled status", () => {
    const { rerender } = render(
      <MemoryRouter>
        <AssistantMessage
          message={{
            id: "3",
            role: "assistant",
            content: "Opening the quiz creation form with your draft…",
            timestamp: new Date("2026-06-24T10:10:00"),
            explanation: "Quiz creation happens in the dedicated form.",
            interpretedAction: {
              action: "Create Quiz",
              course: "CPSC 310",
              affectedStudents: "Course-wide",
              primaryLink: {
                label: "Open quiz creation form",
                href: "/instructor/quizzes/create",
              },
            },
          }}
          onDismissHandoff={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Interpreted Action")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <AssistantMessage
          message={{
            id: "3",
            role: "assistant",
            content: "Opening the quiz creation form with your draft…",
            timestamp: new Date("2026-06-24T10:10:00"),
            handoffDismissed: true,
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByText("Interpreted Action")).not.toBeInTheDocument();
    expect(screen.getByText("This action was cancelled.")).toBeInTheDocument();
  });
});
