import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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

    const selected = screen.getByText("Assignment Reminder").closest("div");
    expect(selected).toHaveClass("border-blue-500");
    expect(screen.getByText("Encouragement")).toBeInTheDocument();
  });
});
