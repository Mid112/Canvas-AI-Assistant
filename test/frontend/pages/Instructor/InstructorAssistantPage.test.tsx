import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InstructorAssistantPage } from "@/pages/Instructor/InstructorAssistantPage";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

describe("InstructorAssistantPage", () => {
  it("renders the assistant header, suggested actions, and chat", () => {
    renderWithInstitution(<InstructorAssistantPage />);

    expect(screen.getByText("AI Assistant")).toBeInTheDocument();
    expect(
      screen.getByText("Canvas Workflow Management Assistant"),
    ).toBeInTheDocument();
    expect(screen.getByText("Suggested Actions")).toBeInTheDocument();
    expect(screen.getByText("Show missing submissions")).toBeInTheDocument();
    expect(
      screen.getByText(/Hello! I'm your Canvas AI Assistant/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Chat message" }),
    ).toBeInTheDocument();
  });
});
