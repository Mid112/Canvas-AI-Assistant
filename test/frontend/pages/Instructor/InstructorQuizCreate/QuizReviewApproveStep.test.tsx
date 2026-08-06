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

  // Verifies: Ticket 14 — editing a question above 1 point keeps the form valid
  // by syncing quiz points_possible to the scored total.
  it("lets instructors set question points greater than 1", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    render(
      <QuizReviewApproveStep
        courseLabel="CPSC 310"
        draft={{
          name: "Recursion Quiz",
          description: "Covers base cases and recursive definitions.",
          dueDate: "2030-12-15T23:59",
          pointsPossible: 1,
          allowedAttempts: 1,
          timeLimit: null,
          questions: [
            {
              questionText: "Explain recursion",
              questionType: "essay_question",
              pointsPossible: 1,
              answers: [],
            },
          ],
        }}
        isApproving={false}
        onApprove={onApprove}
        onBack={vi.fn()}
      />,
    );

    const pointsInput = screen.getByRole("spinbutton", {
      name: "Points for question 1",
    });
    await user.clear(pointsInput);
    await user.type(pointsInput, "5");

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
        pointsPossible: 5,
        questions: [
          expect.objectContaining({
            pointsPossible: 5,
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

  // Answers rode along in form state straight to Canvas without ever being
  // rendered, so instructors approved options — and a correct answer — they
  // had never seen. Canvas only showed them after the quiz existed.
  describe("answers", () => {
    function renderWithQuestions(
      questions: Parameters<typeof QuizReviewApproveStep>[0]["draft"]["questions"],
      onApprove = vi.fn(),
    ) {
      render(
        <QuizReviewApproveStep
          courseLabel="CPSC 310"
          draft={{
            name: "Cell Biology Quiz",
            description: "Covers organelles and cell division.",
            dueDate: "2030-12-15T23:59",
            pointsPossible: questions.reduce((sum, q) => sum + q.pointsPossible, 0),
            allowedAttempts: 1,
            timeLimit: null,
            questions,
          }}
          isApproving={false}
          onApprove={onApprove}
          onBack={vi.fn()}
        />,
      );
      return onApprove;
    }

    const mcq = {
      questionText: "Which organelle makes ATP?",
      questionType: "multiple_choice_question" as const,
      pointsPossible: 10,
      answers: [
        { text: "Mitochondria", weight: 100 },
        { text: "Ribosome", weight: 0 },
      ],
    };

    it("shows the generated answer options", () => {
      renderWithQuestions([mcq]);

      expect(screen.getByLabelText("Answer 1 of question 1")).toHaveValue(
        "Mitochondria",
      );
      expect(screen.getByLabelText("Answer 2 of question 1")).toHaveValue(
        "Ribosome",
      );
    });

    it("marks which answer is correct", () => {
      renderWithQuestions([mcq]);

      expect(
        screen.getByLabelText("Mark answer 1 of question 1 as correct"),
      ).toBeChecked();
      expect(
        screen.getByLabelText("Mark answer 2 of question 1 as correct"),
      ).not.toBeChecked();
      // Ticket 45 / #1506: correct option is labeled in the UI, not only via radio.
      expect(screen.getByText("Correct")).toBeInTheDocument();
      expect(screen.getByText("Points")).toBeInTheDocument();
    });

    // Canvas requires exactly one answer at weight 100; picking a new correct
    // answer must clear the old one rather than produce two.
    it("moves the correct answer instead of adding a second", async () => {
      const user = userEvent.setup();
      const onApprove = renderWithQuestions([mcq]);

      await user.click(
        screen.getByLabelText("Mark answer 2 of question 1 as correct"),
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
          questions: [
            expect.objectContaining({
              answers: [
                { text: "Mitochondria", weight: 0 },
                { text: "Ribosome", weight: 100 },
              ],
            }),
          ],
        }),
        expect.anything(),
      );
    });

    // Essay and short-answer items are instructor-scored and carry no options.
    it("omits the answer block for essay questions", () => {
      renderWithQuestions([
        {
          questionText: "Explain mitosis in your own words.",
          questionType: "essay_question",
          pointsPossible: 10,
          answers: [],
        },
      ]);

      expect(
        screen.queryByLabelText("Answer 1 of question 1"),
      ).not.toBeInTheDocument();
    });

    // Points must be freely redistributable, down to fractions — a fixed
    // step="1" blocked that and also rejected generated values like 16.67.
    it("accepts fractional question points", async () => {
      const user = userEvent.setup();
      const onApprove = renderWithQuestions([mcq]);

      const points = screen.getByLabelText("Points for question 1");
      await user.clear(points);
      await user.type(points, "9.5");
      const total = screen.getByLabelText("Points possible");
      await user.clear(total);
      await user.type(total, "9.5");

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
          pointsPossible: 9.5,
          questions: [expect.objectContaining({ pointsPossible: 9.5 })],
        }),
        expect.anything(),
      );
    });
  });
});
