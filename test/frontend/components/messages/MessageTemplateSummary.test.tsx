import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MessageTemplateSummary } from "@/components/messages/MessageTemplateSummary";

describe("MessageTemplateSummary", () => {
  // Verifies: Highlights the selected template.
  it("highlights the selected template", () => {
    render(
      <MessageTemplateSummary
        selectedTemplateId="assignment-reminder"
        selectedTemplateName="Assignment Reminder"
      />,
    );

    const selected = screen.getByRole("button", { name: /Assignment Reminder/i });
    expect(selected).toHaveClass("border-primary");
    expect(screen.getByText("Encouragement")).toBeInTheDocument();
    expect(screen.queryByText("Grade Feedback")).not.toBeInTheDocument();
  });

  it("calls onSelectTemplate when a template is clicked", async () => {
    const user = userEvent.setup();
    const onSelectTemplate = vi.fn();

    render(
      <MessageTemplateSummary
        selectedTemplateId="assignment-reminder"
        onSelectTemplate={onSelectTemplate}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Course Announcement/i }));

    expect(onSelectTemplate).toHaveBeenCalledWith("course-announcement");
  });
});
