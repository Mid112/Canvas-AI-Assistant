// Test note: covers the assistant message.test behavior so future changes can preserve the expected Canvas workflow contract.

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

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
  // Verifies: Regression (#12, #13) — an answer the backend could not verify
  // is shown in full with a warning beside it. The old behaviour rewrote the
  // number inside the text to "[grade redacted]", which hid real answers far
  // more often than fabricated ones.
  it("shows the full text plus a notice when claims are unverified", () => {
    render(
      <AssistantMessage
        message={{
          id: "unverified-1",
          role: "assistant",
          content: "Average overall grade 82 %.",
          timestamp: new Date("2026-06-24T10:00:00"),
          unverifiedClaims: ["grade"],
        }}
      />,
    );

    expect(screen.getByText("Average overall grade 82 %.")).toBeInTheDocument();
    expect(screen.queryByText(/redacted/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/could not be verified against your\s+Canvas data/),
    ).toBeInTheDocument();
  });

  // Verifies: Regression (#12) — the notice must stay quiet on grounded
  // replies, or instructors learn to ignore it.
  it("shows no notice when nothing was flagged", () => {
    render(
      <AssistantMessage
        message={{
          id: "verified-1",
          role: "assistant",
          content: "Alex Chen scored 88 on Homework 1.",
          timestamp: new Date("2026-06-24T10:00:00"),
        }}
      />,
    );

    expect(
      screen.queryByText(/could not be verified/),
    ).not.toBeInTheDocument();
  });

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

  it("renders action summary, alerts, and actions as separate sections", () => {
    render(
      <AssistantMessage
        message={{
          id: "3",
          role: "assistant",
          content: "I prepared a message for review.",
          timestamp: new Date("2026-06-24T10:10:00"),
          pendingMessageId: 42,
          pendingActionStatus: "pending",
          interpretedAction: {
            action: "Send Message",
            course: "COSC 499",
            affectedStudents: "Entire class",
            risk: {
              risk_level: "high",
              classification: "irreversible",
              requires_confirmation: true,
              confirmation_requirement: {
                type: "strong",
                label: "Strong confirmation",
                description: "Type CONFIRM before executing this high-risk action.",
                confirmation_phrase: "CONFIRM",
              },
              destructive: true,
              reversible: false,
              undoable: false,
              can_undo: false,
              reversibility: "This action cannot be undone once submitted.",
              warnings: ["Review recipients and content carefully before confirming."],
              technical_details: { action: "send_message" },
            },
          },
        }}
        pendingActionError="Unable to confirm action."
        onConfirmPendingAction={vi.fn()}
        onCancelPendingAction={vi.fn()}
        onModifyPendingAction={vi.fn()}
      />,
    );

    expect(screen.getByText("Interpreted Action")).toBeInTheDocument();
    expect(screen.getByText("Alerts")).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(
      screen.getByText("Review recipients and content carefully before confirming."),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to confirm action.");
    expect(
      screen.getByRole("button", { name: "Edit before sending" }),
    ).toBeInTheDocument();
  });

  it("hides the action offer after the workflow is confirmed", () => {
    render(
      <AssistantMessage
        message={{
          id: "4",
          role: "assistant",
          content: "Assignment created.",
          timestamp: new Date("2026-06-24T10:15:00"),
          pendingMessageId: 42,
          pendingActionStatus: "confirmed",
          interpretedAction: {
            action: "Create Assignment",
            course: "COSC 499",
            affectedStudents: "Course-wide",
            primaryLink: {
              label: "Review preview",
              href: "/instructor/actions/preview?conversation=7&pending=42",
            },
          },
        }}
      />,
    );

    expect(screen.queryByText("Interpreted Action")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Review preview/i })).not.toBeInTheDocument();
    expect(screen.getByText("This action was confirmed.")).toBeInTheDocument();
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
