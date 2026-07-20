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
          description: "Covers base cases and recursive definitions.",
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

  it("lets Classic quizzes link a randomized Canvas question bank", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    render(
      <QuizReviewApproveStep
        courseLabel="CPSC 310"
        draft={{
          name: "Bank Quiz",
          description: "Uses the recursion bank for randomized practice.",
          dueDate: "2030-12-15T23:59",
          pointsPossible: 5,
          allowedAttempts: 1,
          timeLimit: null,
          quizEngine: "classic",
          questions: [],
          questionBankGroups: [],
        }}
        capabilities={{
          classicQuizzes: true,
          newQuizzes: true,
          questionBanks: true,
          preferredEngine: "new_quizzes",
        }}
        questionBanks={[
          { id: 31, title: "Recursion Bank", questionCount: 12 },
        ]}
        isApproving={false}
        onApprove={onApprove}
        onBack={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Use Recursion Bank (12)" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Preview & Approve Quiz" }),
      ).toBeEnabled(),
    );
    await user.click(
      screen.getByRole("button", { name: "Preview & Approve Quiz" }),
    );

    expect(onApprove).toHaveBeenCalledWith(
      expect.objectContaining({
        quizEngine: "classic",
        questionBankGroups: [
          {
            bankId: 31,
            bankName: "Recursion Bank",
            pickCount: 5,
            questionPoints: 1,
          },
        ],
      }),
      expect.anything(),
    );
  });

  it("requires an explicit fallback when New Quizzes cannot keep bank links", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    render(
      <QuizReviewApproveStep
        courseLabel="CPSC 310"
        draft={{
          name: "Bank Quiz",
          description: "Uses the recursion bank for randomized practice.",
          dueDate: "2030-12-15T23:59",
          pointsPossible: 10,
          allowedAttempts: 1,
          timeLimit: null,
          quizEngine: "classic",
          questions: [
            {
              questionText: "What is a base case?",
              questionType: "essay_question",
              pointsPossible: 5,
              answers: [],
            },
          ],
          questionBankGroups: [
            {
              bankId: 31,
              bankName: "Recursion Bank",
              pickCount: 5,
              questionPoints: 1,
            },
          ],
        }}
        capabilities={{
          classicQuizzes: true,
          newQuizzes: true,
          questionBanks: true,
          preferredEngine: "new_quizzes",
        }}
        isApproving={false}
        onApprove={onApprove}
        onBack={vi.fn()}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText("Canvas quiz engine"),
      "new_quizzes",
    );

    expect(
      screen.getByText("Question-bank links require a Classic Quiz"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preview & Approve Quiz" }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("button", {
        name: "Continue with New Quiz without banks",
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Preview & Approve Quiz" }),
      ).toBeEnabled(),
    );
    await user.click(
      screen.getByRole("button", { name: "Preview & Approve Quiz" }),
    );

    expect(onApprove).toHaveBeenCalledWith(
      expect.objectContaining({
        quizEngine: "new_quizzes",
        questionBankGroups: [],
      }),
      expect.anything(),
    );
  });
});
