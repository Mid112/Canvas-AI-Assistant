import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssignmentDescribeStep } from "@/pages/Instructor/InstructorAssignmentCreate/AssignmentDescribeStep";

describe("AssignmentDescribeStep", () => {
  it("disables generate until course and prompt are valid", async () => {
    const user = userEvent.setup();

    render(
      <AssignmentDescribeStep
        defaultValues={{ courseId: "", prompt: "" }}
        isGenerating={false}
        onGenerate={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Generate Assignment" }),
    ).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Select Course"), "1");
    await user.type(
      screen.getByLabelText("Assignment Prompt"),
      "Create a quiz on Python functions and parameters for beginners.",
    );

    expect(
      screen.getByRole("button", { name: "Generate Assignment" }),
    ).toBeEnabled();
  });

  it("fills prompt from suggested prompts", async () => {
    const user = userEvent.setup();

    render(
      <AssignmentDescribeStep
        defaultValues={{ courseId: "1", prompt: "" }}
        isGenerating={false}
        onGenerate={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Create a quiz on Python functions and parameters",
      }),
    );

    expect(screen.getByLabelText("Assignment Prompt")).toHaveValue(
      "Create a quiz on Python functions and parameters",
    );
  });
});
