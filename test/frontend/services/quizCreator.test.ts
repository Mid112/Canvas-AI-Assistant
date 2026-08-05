import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  approveQuizDraft,
  fetchQuestionBanks,
  fetchQuizCapabilities,
  generateQuizDraft,
  previewQuizDraft,
} from "@/services/quizCreator";

const payload = {
  courseId: "3",
  name: "Recursion Quiz",
  description: "Covers base cases and recursive definitions.",
  dueDate: "2030-12-15T23:59",
  pointsPossible: 5,
  allowedAttempts: 2,
  timeLimit: 30,
  questions: [
    {
      questionText: "What is a base case?",
      questionType: "essay_question" as const,
      pointsPossible: 5,
      answers: [],
    },
  ],
};

describe("quizCreator", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps generated quiz questions into the editable draft", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          title: "Recursion Quiz",
          description: "Covers base cases and recursive definitions.",
          due_at: "2030-12-15T23:59:00Z",
          points_possible: 20,
          allowed_attempts: 2,
          time_limit: 30,
          questions: [
            {
              question_text: "What is a base case?",
              question_type: "essay_question",
              points_possible: 5,
              answers: [],
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await generateQuizDraft(3, "Create a recursion quiz", {
      accessToken: "token",
    });

    expect(result.name).toBe("Recursion Quiz");
    expect(result.questions[0].questionText).toBe("What is a base case?");
    expect(result.questions[0].pointsPossible).toBe(5);
    // Quiz total is realigned to the scored question sum (Ticket 14).
    expect(result.pointsPossible).toBe(5);
  });

  it("preserves multi-point questions from the draft API", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          title: "Weighted Quiz",
          description: "Uses multi-point questions.",
          due_at: "2030-12-15T23:59:00Z",
          points_possible: 100,
          allowed_attempts: 1,
          time_limit: null,
          questions: [
            {
              question_text: "Essay",
              question_type: "essay_question",
              points_possible: 5,
              answers: [],
            },
            {
              question_text: "Short",
              question_type: "short_answer_question",
              points_possible: 2,
              answers: [],
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await generateQuizDraft(3, "Create a weighted quiz", {
      accessToken: "token",
    });

    expect(result.questions.map((question) => question.pointsPossible)).toEqual([
      5, 2,
    ]);
    expect(result.pointsPossible).toBe(7);
  });

  it("previews the exact body that will later be created", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            summary: "Create Recursion Quiz",
            reversible: true,
            risk_level: "medium",
            affected_resources: [{ type: "quiz", name: "Recursion Quiz" }],
            metadata: { question_count: 1 },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 10, title: "Recursion Quiz", warnings: [] }),
          { status: 200 },
        ),
      );

    const preview = await previewQuizDraft(payload, { accessToken: "token" });
    await approveQuizDraft(payload, {
      accessToken: "token",
      conversationId: 42,
    });

    const previewBody = JSON.parse(
      String(vi.mocked(fetch).mock.calls[0][1]?.body),
    );
    const createBody = JSON.parse(
      String(vi.mocked(fetch).mock.calls[1][1]?.body),
    );
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain(
      "conversation_id=42",
    );
    expect(previewBody).toEqual(createBody);
    expect(preview.riskLevel).toBe("medium");
    expect(preview.affectedResources[0].type).toBe("quiz");
  });

  it("recovers a matching quiz when create fails after Canvas may have written", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("upstream timeout", { status: 502 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 88,
              title: "Recursion Quiz",
              description: payload.description,
              due_at: "2030-12-15T23:59:00Z",
              points_possible: 5,
              question_count: payload.questions.length,
            },
          ]),
          { status: 200 },
        ),
      );

    await expect(
      approveQuizDraft(payload, { accessToken: "token" }),
    ).resolves.toMatchObject({
      id: 88,
      title: "Recursion Quiz",
      warnings: [
        expect.stringContaining("Best-effort recovery"),
      ],
    });
  });

  it("does not recover a quiz when description or question count diverge", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("upstream timeout", { status: 502 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 88,
              title: "Recursion Quiz",
              description: "A different quiz description entirely.",
              due_at: "2030-12-15T23:59:00Z",
              points_possible: 5,
              question_count: 99,
            },
          ]),
          { status: 200 },
        ),
      );

    await expect(
      approveQuizDraft(payload, { accessToken: "token" }),
    ).rejects.toThrow();
  });

  it("maps Canvas quiz capabilities", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          classic_quizzes: true,
          new_quizzes: true,
          question_banks: true,
          preferred_engine: "new_quizzes",
          new_quizzes_unavailable_reason: null,
        }),
        { status: 200 },
      ),
    );

    await expect(
      fetchQuizCapabilities(3, { accessToken: "token" }),
    ).resolves.toMatchObject({
      classicQuizzes: true,
      newQuizzes: true,
      preferredEngine: "new_quizzes",
    });
  });

  it("loads Classic question banks on demand", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify([
          { id: 31, title: "Recursion Bank", question_count: 12 },
        ]),
        { status: 200 },
      ),
    );

    await expect(
      fetchQuestionBanks(3, { accessToken: "token" }),
    ).resolves.toEqual([
      { id: 31, title: "Recursion Bank", questionCount: 12 },
    ]);
  });
});
