import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ActionCard } from "@/components/chat/ActionCard";
import { AssistantMessage } from "@/components/chat/AssistantMessage";
import { ExplanationCard } from "@/components/chat/ExplanationCard";

describe("ExplanationCard", () => {
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
  it("renders interpreted action details", () => {
    render(
      <ActionCard
        action={{
          action: "Send Reminder",
          course: "COSC 499",
          affectedStudents: "12 students",
        }}
      />,
    );

    expect(screen.getByText("Interpreted Action")).toBeInTheDocument();
    expect(screen.getByText("Send Reminder")).toBeInTheDocument();
    expect(screen.getByText("COSC 499")).toBeInTheDocument();
    expect(screen.getByText("12 students")).toBeInTheDocument();
  });
});

describe("AssistantMessage", () => {
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
});
