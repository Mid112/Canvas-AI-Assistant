import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssignmentDescribeStep } from "@/pages/Instructor/InstructorAssignmentCreate/AssignmentDescribeStep";

describe("AssignmentDescribeStep", () => {
  // Verifies: Disables generate until course and prompt are valid.
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

  // Verifies: Fills prompt from suggested prompts.
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

  // A quiz prompt typed into this page used to be silently rendered as prose
  // into the assignment description, producing something that reads like a
  // quiz but has no question items Canvas can administer.
  describe("quiz request detection", () => {
    const quizPrompt =
      "Create a quiz called 'recursion principles' with 5 multiple-choice " +
      "questions about cell biology. Each question should have 4 options.";

    async function typePrompt(text: string, onSwitchToQuiz?: () => void) {
      const user = userEvent.setup();
      render(
        <AssignmentDescribeStep
          defaultValues={{ courseId: "", prompt: "" }}
          isGenerating={false}
          onGenerate={vi.fn()}
          {...(onSwitchToQuiz ? { onSwitchToQuiz } : {})}
        />,
      );
      await user.type(screen.getByLabelText("Assignment Prompt"), text);
      return user;
    }

    it("offers the Quiz Creator when the prompt reads like a quiz", async () => {
      await typePrompt(quizPrompt, vi.fn());

      expect(await screen.findByText(/This looks like a quiz/)).toBeInTheDocument();
    });

    it("hands the prompt over rather than making the instructor retype it", async () => {
      const onSwitchToQuiz = vi.fn();
      const user = await typePrompt(quizPrompt, onSwitchToQuiz);

      await user.click(
        await screen.findByRole("button", { name: "Switch to Quiz Creator" }),
      );

      expect(onSwitchToQuiz).toHaveBeenCalledWith(quizPrompt);
    });

    // Offered, never forced — an assignment that legitimately describes a quiz
    // is a real thing to want.
    it("stays dismissed once dismissed", async () => {
      const user = await typePrompt(quizPrompt, vi.fn());

      await user.click(await screen.findByRole("button", { name: "Dismiss" }));

      expect(screen.queryByText(/This looks like a quiz/)).not.toBeInTheDocument();
    });

    it("stays out of the way for ordinary assignment prompts", async () => {
      await typePrompt(
        "Create a programming assignment about arrays and sorting algorithms.",
        vi.fn(),
      );

      expect(screen.queryByText(/This looks like a quiz/)).not.toBeInTheDocument();
    });
  });
});
