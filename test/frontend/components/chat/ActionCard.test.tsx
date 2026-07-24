import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

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

  it("calls onDismiss when Cancel is pressed", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <MemoryRouter>
        <ActionCard
          action={{
            action: "Create Quiz",
            course: "CPSC 310",
            affectedStudents: "Course-wide",
            primaryLink: {
              label: "Open quiz creation form",
              href: "/instructor/quizzes/create",
            },
          }}
          onDismiss={onDismiss}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe("RiskAlerts", () => {
  function makeRisk(overrides = {}) {
    return {
      risk_level: "high" as const,
      classification: "irreversible",
      requires_confirmation: true,
      confirmation_requirement: {
        type: "strong" as const,
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
      ...overrides,
    };
  }

  it("shows warnings, undo/reversibility copy, and expandable technical details", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <RiskAlerts risk={makeRisk()} />
      </MemoryRouter>,
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

  // Verifies: Undoable actions without an attached workflow still fall back to the history page.
  it("links undoable actions to workflow history when direct reversal is unavailable", () => {
    render(
      <MemoryRouter>
        <RiskAlerts
          risk={makeRisk({
            risk_level: "medium",
            classification: "modifying",
            destructive: false,
            reversible: true,
            undoable: true,
            can_undo: true,
            reversibility: "This action can be undone from workflow history.",
            warnings: [],
            technical_details: { action: "create_assignment" },
          })}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Can be undone")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open workflow history" })).toHaveAttribute(
      "href",
      "/instructor/history",
    );
  });

  // Verifies: Once chat knows the approved workflow id, undoable actions show the direct reversal button first.
  it("shows a direct reverse button when direct reversal is available", async () => {
    const user = userEvent.setup();
    const onReverseAction = vi.fn();

    render(
      <MemoryRouter>
        <RiskAlerts
          risk={makeRisk({
            risk_level: "medium",
            classification: "modifying",
            destructive: false,
            reversible: true,
            undoable: true,
            can_undo: true,
            reversibility: "This action can be undone from workflow history.",
            warnings: [],
            technical_details: { action: "create_assignment" },
          })}
          canReverseAction
          onReverseAction={onReverseAction}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Reverse action" }));

    expect(onReverseAction).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole("button", { name: "Open workflow history" }),
    ).not.toBeInTheDocument();
  });

  // Verifies: After a direct reversal completes, the card changes back to the audit trail link.
  it("links to workflow history after direct reversal completes", () => {
    render(
      <MemoryRouter>
        <RiskAlerts
          risk={makeRisk({
            risk_level: "medium",
            classification: "modifying",
            destructive: false,
            reversible: true,
            undoable: true,
            can_undo: true,
            reversibility: "This action can be undone from workflow history.",
            warnings: [],
            technical_details: { action: "create_assignment" },
          })}
          canReverseAction
          reversalCompleted
          onReverseAction={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("button", { name: "Reverse action" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open workflow history" })).toHaveAttribute(
      "href",
      "/instructor/history",
    );
  });
});
