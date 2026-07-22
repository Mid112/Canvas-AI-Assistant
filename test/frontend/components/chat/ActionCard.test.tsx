import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ActionCard } from "@/components/chat/ActionCard";
import { RiskAlerts } from "@/components/chat/RiskAlerts";

describe("ActionCard", () => {
  it("shows a concise summary and expandable safe technical details", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ActionCard
          action={{
            action: "Create Quiz",
            course: "CPSC 310",
            affectedStudents: "Course-wide",
            technicalDetails: [
              { label: "Risk level", value: "medium" },
              { label: "Reversible", value: "Yes" },
            ],
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Create Quiz")).toBeInTheDocument();
    expect(screen.getByText("CPSC 310")).toBeInTheDocument();
    expect(screen.queryByText("medium")).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Technical details" });
    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("medium")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
  });

  it("shows the risk badge without nesting alert details", () => {
    render(
      <MemoryRouter>
        <ActionCard
          action={{
            action: "Send Message",
            course: "CPSC 310",
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
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("high risk")).toBeInTheDocument();
    expect(screen.queryByText("Alerts")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Review recipients and content carefully before confirming."),
    ).not.toBeInTheDocument();
  });
});

describe("RiskAlerts", () => {
  it("shows warnings, undo/reversibility copy, and expandable technical details", async () => {
    const user = userEvent.setup();

    render(
      <RiskAlerts
        risk={{
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
          technical_details: {
            action: "send_message",
            classification: "irreversible",
          },
        }}
      />,
    );

    expect(screen.getByText("Alerts")).toBeInTheDocument();
    expect(
      screen.getByText("Review recipients and content carefully before confirming."),
    ).toBeInTheDocument();
    expect(screen.getByText("No one-click undo")).toBeInTheDocument();
    expect(
      screen.getByText("This action cannot be undone once submitted."),
    ).toBeInTheDocument();

    await user.click(screen.getByText("Risk technical details"));

    expect(screen.getByText(/send_message/)).toBeInTheDocument();
    expect(screen.getByText(/irreversible/)).toBeInTheDocument();
  });
});
