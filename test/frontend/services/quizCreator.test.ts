import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  approveQuizDraft,
  generateQuizDraft,
  previewQuizDraft,
} from "@/services/quizCreator";

const payload = {
  courseId: "3",
  name: "Recursion Quiz",
  description: "Covers base cases",
  dueDate: "2030-12-15T23:59",
  pointsPossible: 20,
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
          description: "Covers base cases",
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
        new Response(JSON.stringify({ id: 10 }), { status: 200 }),
      );

    const preview = await previewQuizDraft(payload, { accessToken: "token" });
    await approveQuizDraft(payload, { accessToken: "token" });

    const previewBody = JSON.parse(
      String(vi.mocked(fetch).mock.calls[0][1]?.body),
    );
    const createBody = JSON.parse(
      String(vi.mocked(fetch).mock.calls[1][1]?.body),
    );
    expect(previewBody).toEqual(createBody);
    expect(preview.riskLevel).toBe("medium");
    expect(preview.affectedResources[0].type).toBe("quiz");
  });
});
