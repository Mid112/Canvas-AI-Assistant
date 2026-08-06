// Test note: covers the instructor quiz create page.test behavior so future changes can preserve the expected Canvas workflow contract.

import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import {
  buildTypedDraftResumeTarget,
  listTypedDrafts,
  saveTypedDraft,
} from "@/lib/typed-draft-storage";
import { InstructorQuizCreatePage } from "@/pages/Instructor/InstructorQuizCreatePage";
import {
  approveQuizDraft,
  fetchQuestionBanks,
  fetchQuizCapabilities,
  generateQuizDraft,
  previewQuizDraft,
} from "@/services/quizCreator";
import type { InstructorCourse } from "@/types/course";
import { renderWithRouter } from "@test/utils/renderWithRouter";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    accessToken: "access-token",
    user: {
      id: 1,
      email: "professor@university.edu",
      name: "Professor",
      role: "instructor",
      is_active: true,
      has_canvas_token: true,
      canvas_connections: [
        {
          id: 1,
          canvas_url: "https://canvas.university.edu",
          created_at: "2026-06-26T00:00:00.000Z",
        },
      ],
    },
  }),
}));

vi.mock("@/hooks/useCanvasConnectionUrl", () => ({
  useCanvasConnectionUrl: () => "https://canvas.university.edu",
}));

vi.mock("@/services/quizCreator", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/services/quizCreator")>();
  return {
    ...actual,
    generateQuizDraft: vi.fn(),
    previewQuizDraft: vi.fn(),
    approveQuizDraft: vi.fn(),
    fetchQuizCapabilities: vi.fn(),
    fetchQuestionBanks: vi.fn(),
  };
});

const course: InstructorCourse = {
  id: 42,
  canvasCourseId: 101,
  canvasUrl: "https://canvas.university.edu",
  code: "CS 101",
  name: "Introduction to Programming",
  progress: 0,
  studentCount: 35,
  assignmentCount: 0,
  lastActivity: "",
  isPublished: true,
  isWritable: true,
  term: null,
};

const mockUseActiveCourse = vi.fn();
const mockUseInstitution = vi.fn();

vi.mock("@/contexts/useActiveCourse", () => ({
  useActiveCourse: () => mockUseActiveCourse(),
}));

vi.mock("@/contexts/useInstitution", () => ({
  useInstitution: () => mockUseInstitution(),
}));

const mockedGenerate = vi.mocked(generateQuizDraft);
const mockedPreview = vi.mocked(previewQuizDraft);
const mockedApprove = vi.mocked(approveQuizDraft);
const mockedCapabilities = vi.mocked(fetchQuizCapabilities);
const mockedFetchQuestionBanks = vi.mocked(fetchQuestionBanks);

function renderPage(state?: Record<string, unknown>) {
  return renderWithRouter(
    <Routes>
      <Route
        path="/instructor/quizzes/create"
        element={<InstructorQuizCreatePage />}
      />
    </Routes>,
    {
      routerProps: {
        initialEntries: [
          {
            pathname: "/instructor/quizzes/create",
            state,
          },
        ],
      },
    },
  );
}

const reviewSeed = {
  courseId: 42,
  name: "Old Quiz Title",
  description: "Old quiz instructions",
  dueDate: "2026-12-15T23:59",
  pointsPossible: 10,
  allowedAttempts: 1,
  timeLimit: null,
  quizEngine: "classic" as const,
  questions: [
    {
      questionText: "What is 2+2?",
      questionType: "multiple_choice_question" as const,
      pointsPossible: 10,
      answers: [
        { text: "4", weight: 100 },
        { text: "5", weight: 0 },
      ],
    },
  ],
  questionBankGroups: [],
};

describe("InstructorQuizCreatePage typed drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockedGenerate.mockResolvedValue({
      name: "Generated Quiz",
      description: "Generated instructions",
      dueDate: "2026-12-15T23:59",
      pointsPossible: 10,
      allowedAttempts: 1,
      timeLimit: null,
      quizEngine: "classic",
      questions: reviewSeed.questions,
      questionBankGroups: [],
    });
    mockedPreview.mockResolvedValue({
      summary: "Create quiz in CS 101",
      reversible: true,
      riskLevel: "medium",
      affectedResources: [{ type: "quiz", name: "Old Quiz Title" }],
      metadata: {},
    });
    mockedApprove.mockResolvedValue();
    mockedCapabilities.mockResolvedValue({
      classicQuizzes: true,
      newQuizzes: false,
      questionBanks: false,
      preferredEngine: "classic",
    });
    mockUseActiveCourse.mockReturnValue({
      availableCourses: [course],
      activeCourse: course,
      isLoading: false,
      error: null,
      needsCanvasConnection: false,
      refreshActiveCourse: vi.fn(),
    });
    mockUseInstitution.mockReturnValue({
      refreshDashboard: vi.fn(),
    });
  });

  it("saves a describe-step prompt as a typed draft and resumes to describe", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(
      screen.getByLabelText("Quiz description"),
      "Raw quiz prompt before generation",
    );
    await user.click(screen.getByRole("button", { name: "Save draft" }));

    await screen.findByText(/Draft saved/i);
    const drafts = listTypedDrafts(1);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.kind).toBe("quiz");
    expect(drafts[0]?.content).toEqual({
      questions: "Raw quiz prompt before generation",
    });

    cleanup();
    renderPage({
      typedDraftId: drafts[0]!.id,
      aiQuizDraft: {
        courseId: 42,
        prompt: "Raw quiz prompt before generation",
      },
    });

    expect(screen.getByText("Describe Your Quiz")).toBeInTheDocument();
    expect(screen.getByLabelText("Quiz description")).toHaveValue(
      "Raw quiz prompt before generation",
    );
    expect(screen.queryByLabelText("Quiz title")).not.toBeInTheDocument();
  });

  // Verifies: the attempt limit and timer are the instructor's own settings,
  // so saving a draft has to carry them. They were dropped before, and the
  // quiz came back with whatever the generator defaulted to.
  it("saves the allowed attempts and time limit onto the typed draft", async () => {
    const user = userEvent.setup();
    renderPage({ aiQuizDraft: reviewSeed });

    const attempts = await screen.findByLabelText("Allowed attempts");
    await user.clear(attempts);
    await user.type(attempts, "3");
    const timeLimit = screen.getByLabelText("Time limit (minutes)");
    await user.clear(timeLimit);
    await user.type(timeLimit, "45");

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText(/Draft saved/i);

    const saved = listTypedDrafts(1);
    expect(saved[0]?.content.allowedAttempts).toBe(3);
    expect(saved[0]?.content.timeLimit).toBe(45);
    // Ticket 45 / #1506: scored points must travel with the draft.
    expect(saved[0]?.content.questionPoints).toEqual([10]);
    expect(saved[0]?.content.pointsPossible).toBe(10);
  });

  // Verifies: a resumed quiz draft lands on describe and regenerates, so the
  // saved settings have to be reapplied over the generator's output. Without
  // that, storing them changes nothing the instructor can see.
  it("reapplies the draft's attempts and time limit after regenerating", async () => {
    const user = userEvent.setup();
    mockedGenerate.mockResolvedValue({
      name: "Generated Quiz",
      description: "Generated instructions",
      dueDate: "2026-12-15T23:59",
      pointsPossible: 10,
      // The generator's own defaults, which must lose to the draft's values.
      allowedAttempts: 1,
      timeLimit: null,
      quizEngine: "classic",
      questions: reviewSeed.questions,
      questionBankGroups: [],
    });

    renderPage({
      aiQuizDraft: {
        courseId: 42,
        name: "Midterm",
        description: "",
        prompt: "Create a midterm quiz covering the first half of the term",
        allowedAttempts: 3,
        timeLimit: 45,
      },
    });

    const generate = await screen.findByRole("button", {
      name: "Generate Quiz Draft",
    });
    await waitFor(() => expect(generate).toBeEnabled());
    await user.click(generate);

    expect(await screen.findByLabelText("Allowed attempts")).toHaveValue(3);
    expect(screen.getByLabelText("Time limit (minutes)")).toHaveValue(45);
  });

  // Regression for #1506: minor describe edit + Generate must keep prior
  // per-question points when the question count is unchanged (10 → not 5).
  it("preserves per-question points across back-to-describe regenerations", async () => {
    const user = userEvent.setup();
    mockedGenerate
      .mockResolvedValueOnce({
        name: "Cell Biology",
        description: "organelle quiz",
        dueDate: "2026-12-15T23:59",
        pointsPossible: 20,
        allowedAttempts: 1,
        timeLimit: 30,
        quizEngine: "classic",
        questions: [
          {
            questionText: "Q1",
            questionType: "multiple_choice_question",
            pointsPossible: 10,
            answers: [
              { text: "A", weight: 100 },
              { text: "B", weight: 0 },
            ],
          },
          {
            questionText: "Q2",
            questionType: "multiple_choice_question",
            pointsPossible: 10,
            answers: [
              { text: "C", weight: 100 },
              { text: "D", weight: 0 },
            ],
          },
        ],
        questionBankGroups: [],
      })
      .mockResolvedValueOnce({
        name: "Cell Biology",
        description: "organism quiz",
        dueDate: "2026-12-15T23:59",
        // Model reallocates to 5 each (the bug) — page must restore 10.
        pointsPossible: 10,
        allowedAttempts: 1,
        timeLimit: 30,
        quizEngine: "classic",
        questions: [
          {
            questionText: "Q1 rewritten",
            questionType: "multiple_choice_question",
            pointsPossible: 5,
            answers: [
              { text: "A", weight: 100 },
              { text: "B", weight: 0 },
            ],
          },
          {
            questionText: "Q2 rewritten",
            questionType: "multiple_choice_question",
            pointsPossible: 5,
            answers: [
              { text: "C", weight: 100 },
              { text: "D", weight: 0 },
            ],
          },
        ],
        questionBankGroups: [],
      });

    renderPage({
      aiQuizDraft: {
        courseId: 42,
        prompt: "5 MCQs about organelles, 50 points total",
      },
    });

    const generate = await screen.findByRole("button", {
      name: "Generate Quiz Draft",
    });
    await waitFor(() => expect(generate).toBeEnabled());
    await user.click(generate);

    expect(await screen.findByLabelText("Points for question 1")).toHaveValue(10);
    expect(screen.getByLabelText("Points for question 2")).toHaveValue(10);
    expect(screen.getAllByText("Correct").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /Back to Describe/i }));
    const prompt = await screen.findByLabelText("Quiz description");
    await user.clear(prompt);
    await user.type(prompt, "5 MCQs about organisms, 50 points total");
    await user.click(
      screen.getByRole("button", { name: "Generate Quiz Draft" }),
    );

    expect(await screen.findByLabelText("Points for question 1")).toHaveValue(10);
    expect(screen.getByLabelText("Points for question 2")).toHaveValue(10);
    expect(screen.getByLabelText("Points possible")).toHaveValue(20);
  });

  // Regression for #1506: save → resume → Generate restores questionPoints.
  it("restores saved questionPoints after resume and regenerate", async () => {
    const user = userEvent.setup();
    mockedGenerate.mockResolvedValue({
      name: "Cell Biology",
      description: "organism quiz",
      dueDate: "2026-12-15T23:59",
      pointsPossible: 10,
      allowedAttempts: 1,
      timeLimit: 30,
      quizEngine: "classic",
      questions: [
        {
          questionText: "Q1",
          questionType: "multiple_choice_question",
          pointsPossible: 5,
          answers: [
            { text: "A", weight: 100 },
            { text: "B", weight: 0 },
          ],
        },
        {
          questionText: "Q2",
          questionType: "multiple_choice_question",
          pointsPossible: 5,
          answers: [
            { text: "C", weight: 100 },
            { text: "D", weight: 0 },
          ],
        },
      ],
      questionBankGroups: [],
    });

    renderPage({
      aiQuizDraft: {
        courseId: 42,
        name: "Cell Biology",
        description: "",
        prompt: "Create a quiz about organisms",
        priorQuestionPoints: [10, 10],
        pointsPossible: 20,
      },
    });

    const generate = await screen.findByRole("button", {
      name: "Generate Quiz Draft",
    });
    await waitFor(() => expect(generate).toBeEnabled());
    await user.click(generate);

    expect(await screen.findByLabelText("Points for question 1")).toHaveValue(10);
    expect(screen.getByLabelText("Points for question 2")).toHaveValue(10);
    expect(screen.getByLabelText("Points possible")).toHaveValue(20);
  });

  // Regression for #1538 review: an invalid entry (0) in priorQuestionPoints
  // must not be compacted out before applyPriorQuestionPoints runs, or the
  // remaining valid entries shift and land on the wrong questions.
  it("restores neighboring questionPoints by index when a middle entry is invalid", async () => {
    const user = userEvent.setup();
    mockedGenerate.mockResolvedValue({
      name: "Cell Biology",
      description: "organism quiz",
      dueDate: "2026-12-15T23:59",
      pointsPossible: 15,
      allowedAttempts: 1,
      timeLimit: 30,
      quizEngine: "classic",
      questions: [
        {
          questionText: "Q1",
          questionType: "multiple_choice_question",
          pointsPossible: 5,
          answers: [
            { text: "A", weight: 100 },
            { text: "B", weight: 0 },
          ],
        },
        {
          questionText: "Q2",
          questionType: "multiple_choice_question",
          pointsPossible: 5,
          answers: [
            { text: "C", weight: 100 },
            { text: "D", weight: 0 },
          ],
        },
        {
          questionText: "Q3",
          questionType: "multiple_choice_question",
          pointsPossible: 5,
          answers: [
            { text: "E", weight: 100 },
            { text: "F", weight: 0 },
          ],
        },
      ],
      questionBankGroups: [],
    });

    renderPage({
      aiQuizDraft: {
        courseId: 42,
        name: "Cell Biology",
        description: "",
        prompt: "Create a quiz about organisms",
        priorQuestionPoints: [10, 0, 10],
        pointsPossible: 20,
      },
    });

    const generate = await screen.findByRole("button", {
      name: "Generate Quiz Draft",
    });
    await waitFor(() => expect(generate).toBeEnabled());
    await user.click(generate);

    expect(await screen.findByLabelText("Points for question 1")).toHaveValue(10);
    expect(screen.getByLabelText("Points for question 2")).toHaveValue(5);
    expect(screen.getByLabelText("Points for question 3")).toHaveValue(10);
  });

  it("saves edited review fields and discards the typed draft after Canvas confirm", async () => {
    const user = userEvent.setup();
    const existing = saveTypedDraft(1, {
      kind: "quiz",
      content: { title: "Old Quiz Title", body: "Old quiz instructions" },
    });

    renderPage({
      typedDraftId: existing.id,
      aiQuizDraft: reviewSeed,
    });

    const titleInput = await screen.findByLabelText("Quiz title");
    await waitFor(() => expect(titleInput).toHaveValue("Old Quiz Title"));
    await user.clear(titleInput);
    await user.type(titleInput, "Edited Quiz Title");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText(/Draft saved/i);

    const saved = listTypedDrafts(1);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.content.title).toBe("Edited Quiz Title");

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Preview & Approve Quiz" }),
      ).toBeEnabled(),
    );
    await user.click(
      screen.getByRole("button", { name: "Preview & Approve Quiz" }),
    );
    await user.click(await screen.findByRole("button", { name: "Confirm & Create" }));

    await waitFor(() => {
      expect(mockedApprove).toHaveBeenCalled();
    });
    expect(listTypedDrafts(1)).toHaveLength(0);
  });

  // Verifies: #1512 — name-only chat seed without prompt must not invent
  // a `Title: …` describe string that steers generation to the title domain.
  it("does not invent a Title-only describe prompt from a name-only seed", () => {
    renderPage({
      aiQuizDraft: {
        courseId: 42,
        name: "recursion principles",
        description: "",
      },
    });

    const description = screen.getByLabelText("Quiz description");
    expect(description).toHaveValue("recursion principles");
    expect(description).not.toHaveValue("Title: recursion principles");
  });

  // Verifies: chat-stamped full utterance wins over title for describe seed.
  it("seeds describe with the full generation prompt when provided", () => {
    const utterance =
      "Create a quiz called 'recursion principles' with 5 multiple-choice questions about cell biology.";
    renderPage({
      aiQuizDraft: {
        courseId: 42,
        name: "recursion principles",
        description: "",
        prompt: utterance,
        pointsPossible: 50,
        timeLimit: 30,
      },
    });

    expect(screen.getByLabelText("Quiz description")).toHaveValue(utterance);
  });

  // Verifies: structured handoff keeps the stamped prompt for Back to Describe (#1512).
  it("keeps the generation prompt when a structured handoff returns to describe", async () => {
    const user = userEvent.setup();
    const utterance =
      "Create a quiz called 'recursion principles' with 5 multiple-choice questions about cell biology. 50 points, 30 minutes.";
    renderPage({
      aiQuizDraft: {
        ...reviewSeed,
        prompt: utterance,
      },
    });

    expect(
      screen.getByRole("button", { name: "Preview & Approve Quiz" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to Describe" }));
    expect(screen.getByLabelText("Quiz description")).toHaveValue(utterance);
    expect(screen.getByLabelText("Quiz description")).not.toHaveValue(
      "Drafted in the AI Assistant",
    );
  });

  // Regression for #1505: saving a draft AFTER questions were generated,
  // then resuming it, must land back on review with those questions intact
  // instead of re-describing with the question text dumped into the prompt.
  it("saves a generated quiz draft and resumes straight to review (#1505)", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(
      screen.getByLabelText("Quiz description"),
      "Create a quiz on Python functions with 1 multiple-choice question",
    );
    const generate = await screen.findByRole("button", {
      name: "Generate Quiz Draft",
    });
    await waitFor(() => expect(generate).toBeEnabled());
    await user.click(generate);

    await screen.findByLabelText("Quiz title");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await screen.findByText(/Draft saved/i);

    const saved = listTypedDrafts(1);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.content.quizQuestions).toEqual(reviewSeed.questions);
    // The description must stay the generator's own text, never a dump of
    // the question texts (#1505's reported symptom).
    expect(saved[0]?.content.body).toBe("Generated instructions");
    expect(saved[0]?.content.body).not.toContain("What is 2+2?");

    const target = buildTypedDraftResumeTarget(saved[0]!, { courseId: 42 });

    cleanup();
    renderPage(target.state as Record<string, unknown>);

    expect(await screen.findByLabelText("Quiz title")).toHaveValue(
      "Generated Quiz",
    );
    expect(screen.queryByText("Describe Your Quiz")).not.toBeInTheDocument();
    const instructions = screen.getByLabelText(
      "Quiz instructions",
    ) as HTMLTextAreaElement;
    expect(instructions.value).toBe("Generated instructions");
    expect(instructions.value).not.toContain("What is 2+2?");
  });

  // Regression for the #1239 review on #1505: a saved draft's question bank
  // group must never carry the raw Canvas bankId into localStorage, and
  // resuming it must still be able to create the quiz — by rematching the
  // stored bankName against the course's live Canvas banks once they load.
  it("saves a bank group without bankId and resolves it by name on resume", async () => {
    const user = userEvent.setup();
    const draft = saveTypedDraft(1, {
      kind: "quiz",
      content: {
        title: "Midterm",
        body: reviewSeed.description,
        quizQuestions: reviewSeed.questions,
        quizQuestionBankGroups: [
          { bankName: "Chapter 1 Bank", pickCount: 2, questionPoints: 5 },
        ],
        dueDate: reviewSeed.dueDate,
        pointsPossible: 20,
        allowedAttempts: null,
        timeLimit: null,
      },
    });

    // The blocking fix: no bankId anywhere in what actually lands in storage.
    expect(draft.content.quizQuestionBankGroups).toEqual([
      { bankName: "Chapter 1 Bank", pickCount: 2, questionPoints: 5 },
    ]);
    expect(
      JSON.stringify(listTypedDrafts(1)[0]?.content.quizQuestionBankGroups),
    ).not.toContain("bankId");

    mockedFetchQuestionBanks.mockResolvedValue([
      { id: 77, title: "Chapter 1 Bank", questionCount: 10 },
    ]);

    const target = buildTypedDraftResumeTarget(draft, { courseId: 42 });
    renderPage(target.state as Record<string, unknown>);

    await user.click(
      await screen.findByRole("button", { name: "Load question banks" }),
    );
    await waitFor(() => expect(mockedFetchQuestionBanks).toHaveBeenCalled());
    await screen.findByRole("button", { name: /Use Chapter 1 Bank/ });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Preview & Approve Quiz" }),
      ).toBeEnabled(),
    );
    await user.click(
      screen.getByRole("button", { name: "Preview & Approve Quiz" }),
    );
    await user.click(await screen.findByRole("button", { name: "Confirm & Create" }));

    await waitFor(() => expect(mockedApprove).toHaveBeenCalled());
    const [payload] = mockedApprove.mock.calls[0]!;
    expect(payload.questionBankGroups).toEqual([
      { bankId: 77, bankName: "Chapter 1 Bank", pickCount: 2, questionPoints: 5 },
    ]);
  });
});
