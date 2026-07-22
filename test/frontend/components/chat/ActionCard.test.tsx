import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ActionCard } from "@/components/chat/ActionCard";

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
});
