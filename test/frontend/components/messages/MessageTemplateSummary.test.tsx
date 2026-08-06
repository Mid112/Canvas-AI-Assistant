import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MessageTemplateSummary } from "@/components/messages/MessageTemplateSummary";
import type { MessageTemplate } from "@/types/messageDraft";

const templates: MessageTemplate[] = [
  {
    id: "1",
    name: "Assignment Reminder",
    description: "Remind students about upcoming work",
    content: "Please submit your assignment.",
  },
  {
    id: "2",
    name: "Encouragement",
    description: "Motivational note",
    content: "Keep going!",
  },
];

describe("MessageTemplateSummary", () => {
  it("highlights the selected template", () => {
    render(
      <MessageTemplateSummary
        templates={templates}
        selectedTemplateId="1"
        selectedTemplateName="Assignment Reminder"
      />,
    );

    const selected = screen.getByRole("button", { name: /Assignment Reminder/i });
    expect(selected.closest("div")).toHaveClass("border-primary");
    expect(screen.getByText("Encouragement")).toBeInTheDocument();
  });

  it("calls onSelectTemplate when a template is clicked", async () => {
    const user = userEvent.setup();
    const onSelectTemplate = vi.fn();

    render(
      <MessageTemplateSummary
        templates={templates}
        selectedTemplateId="1"
        onSelectTemplate={onSelectTemplate}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Encouragement/i }));

    expect(onSelectTemplate).toHaveBeenCalledWith("2");
  });

  it("shows an empty state when there are no templates", () => {
    render(<MessageTemplateSummary templates={[]} />);

    expect(
      screen.getByText(/No saved templates yet/i),
    ).toBeInTheDocument();
  });
});
