import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { QuizReviewApproveStep } from "@/pages/Instructor/InstructorQuizCreate/QuizReviewApproveStep";

describe("QuizReviewApproveStep", () => {
  it("preserves answer choices while editing and requesting a preview", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    render(
      <QuizReviewApproveStep
        courseLabel="CPSC 310"
        draft={{
          name: "Recursion Quiz",
          description: "Covers base cases",
          dueDate: "2030-12-15T23:59",
          pointsPossible: 10,
          allowedAttempts: 1,
          timeLimit: null,
          questions: [
            {
              questionText: "Which is a base case?",
              questionType: "multiple_choice_question",
              pointsPossible: 10,
              answers: [
                { text: "n equals zero", weight: 100 },
                { text: "n grows", weight: 0 },
              ],
            },
          ],
        }}
        isApproving={false}
        onApprove={onApprove}
        onBack={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Preview & Approve Quiz" }),
      ).toBeEnabled(),
    );
    await user.clear(screen.getByLabelText("Question 1"));
    await user.type(screen.getByLabelText("Question 1"), "Choose the base case");
    await user.click(
      screen.getByRole("button", { name: "Preview & Approve Quiz" }),
    );

    expect(onApprove).toHaveBeenCalledWith(
      expect.objectContaining({
        questions: [
          expect.objectContaining({
            questionText: "Choose the base case",
            questionType: "multiple_choice_question",
            answers: [
              { text: "n equals zero", weight: 100 },
              { text: "n grows", weight: 0 },
            ],
          }),
        ],
      }),
      expect.anything(),
    );
  });
});
