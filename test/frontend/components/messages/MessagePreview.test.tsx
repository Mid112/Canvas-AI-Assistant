import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MessagePreview } from "@/components/messages/MessagePreview";

describe("MessagePreview", () => {
  // Verifies: Renders recipients, subject, and formatted body.
  it("renders recipients, subject, and formatted body", () => {
    render(
      <MessagePreview
        recipients={[{ id: "1", name: "John Smith", email: "john@university.edu" }]}
        subject="Assignment Reminder"
        body={"Hello,\n\nPlease submit your work."}
      />,
    );

    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("Assignment Reminder")).toBeInTheDocument();
    expect(screen.getByText(/Please submit your work/i)).toBeInTheDocument();
  });

  // Verifies: Shows empty recipient message.
  it("shows empty recipient message", () => {
    render(
      <MessagePreview recipients={[]} subject="Test" body="Body text" />,
    );

    expect(screen.getByText("No recipients selected")).toBeInTheDocument();
  });
});
