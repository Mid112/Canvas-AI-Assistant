import { API_BASE_URL } from "@/config/api";
import { parseApiError } from "@/lib/api-request";
import { formatDueDateForApi, formatDueDateForInput } from "@/lib/assignment-utils";
import type {
  GeneratedQuizDraft,
  QuizApprovePayload,
  QuizCapabilities,
  QuizPreviewSummary,
  QuizQuestionBank,
  QuizQuestionDraft,
  QuizRiskLevel,
} from "@/types/quizCreate";

export class QuizCreatorApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuizCreatorApiError";
  }
}

function appendCanvasUrl(url: string, canvasUrl?: string): string {
  if (!canvasUrl) {
    return url;
  }
  return `${url}?${new URLSearchParams({ canvas_url: canvasUrl }).toString()}`;
}

function defaultDueDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  date.setHours(23, 59, 0, 0);
  return formatDueDateForInput(date.toISOString());
}

interface QuizDraftApiResponse {
  title: string;
  description: string;
  due_at: string | null;
  points_possible: number | null;
  allowed_attempts: number | null;
  time_limit: number | null;
  questions: Array<{
    question_text: string;
    question_type: QuizQuestionDraft["questionType"];
    points_possible: number;
    answers: Array<{ text?: string; weight?: number }>;
  }>;
}

interface GenerateQuizDraftOptions {
  accessToken: string;
  canvasUrl?: string;
}

export async function generateQuizDraft(
  courseId: number,
  prompt: string,
  options: GenerateQuizDraftOptions,
): Promise<GeneratedQuizDraft> {
  const response = await fetch(
    appendCanvasUrl(
      `${API_BASE_URL}/canvas/courses/${courseId}/quizzes/generate-draft`,
      options.canvasUrl,
    ),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.accessToken}`,
      },
      body: JSON.stringify({ prompt }),
    },
  );

  if (!response.ok) {
    throw new QuizCreatorApiError(await parseApiError(response));
  }

  const data = (await response.json()) as QuizDraftApiResponse;

  return {
    name: data.title,
    description: data.description,
    dueDate: data.due_at ? formatDueDateForInput(data.due_at) : defaultDueDate(),
    pointsPossible: data.points_possible ?? 100,
    allowedAttempts: data.allowed_attempts,
    timeLimit: data.time_limit,
    quizEngine: "classic",
    questions: (data.questions ?? []).map((question) => ({
      questionText: question.question_text,
      questionType: question.question_type,
      pointsPossible: question.points_possible ?? 1,
      answers: (question.answers ?? []).map((answer) => ({
        text: String(answer.text ?? ""),
        weight: Number(answer.weight ?? 0),
      })),
    })),
    questionBankGroups: [],
  };
}

function toQuizCreateBody(payload: QuizApprovePayload) {
  const courseId = Number(payload.courseId);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    throw new QuizCreatorApiError("A valid course is required.");
  }

  return {
    courseId,
    quiz: {
      title: payload.name.trim(),
      description: payload.description.trim() || null,
      due_at: payload.dueDate ? formatDueDateForApi(payload.dueDate) : null,
      points_possible: payload.pointsPossible,
      allowed_attempts: payload.allowedAttempts,
      time_limit: payload.timeLimit,
      quiz_engine: payload.quizEngine ?? "classic",
      published: false,
      questions: payload.questions.map((question) => ({
        question_text: question.questionText,
        question_type: question.questionType,
        points_possible: question.pointsPossible,
        answers: question.answers.map((answer) => ({
          text: answer.text,
          weight: answer.weight,
        })),
      })),
      question_bank_groups: (payload.questionBankGroups ?? []).map((group) => ({
        bank_id: group.bankId,
        bank_name: group.bankName,
        pick_count: group.pickCount,
        question_points: group.questionPoints,
      })),
    },
  };
}

interface QuizPreviewApiResponse {
  summary: string;
  reversible: boolean;
  risk_level?: QuizRiskLevel;
  affected_resources: { type: string; name: string }[];
  metadata?: Record<string, unknown>;
}

interface PreviewQuizDraftOptions {
  accessToken: string;
  canvasUrl?: string;
}

export async function previewQuizDraft(
  payload: QuizApprovePayload,
  options: PreviewQuizDraftOptions,
): Promise<QuizPreviewSummary> {
  const request = toQuizCreateBody(payload);
  const response = await fetch(
    appendCanvasUrl(
      `${API_BASE_URL}/canvas/courses/${request.courseId}/quizzes/preview`,
      options.canvasUrl,
    ),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.accessToken}`,
      },
      body: JSON.stringify(request.quiz),
    },
  );

  if (!response.ok) {
    throw new QuizCreatorApiError(await parseApiError(response));
  }

  const data = (await response.json()) as QuizPreviewApiResponse;
  return {
    summary: data.summary,
    reversible: data.reversible,
    riskLevel: data.risk_level ?? "medium",
    affectedResources: data.affected_resources,
    metadata: data.metadata ?? {},
  };
}

interface ApproveQuizDraftOptions {
  accessToken: string;
  canvasUrl?: string;
  conversationId?: number;
}

export async function approveQuizDraft(
  payload: QuizApprovePayload,
  options: ApproveQuizDraftOptions,
): Promise<{ id: number; title: string; warnings: string[] }> {
  const request = toQuizCreateBody(payload);
  let createUrl = appendCanvasUrl(
    `${API_BASE_URL}/canvas/courses/${request.courseId}/quizzes`,
    options.canvasUrl,
  );
  if (options.conversationId != null) {
    const separator = createUrl.includes("?") ? "&" : "?";
    createUrl += `${separator}conversation_id=${options.conversationId}`;
  }
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${options.accessToken}`,
  };

  let response: Response;
  try {
    response = await fetch(createUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(request.quiz),
    });
  } catch {
    const recovered = await recoverCreatedQuiz(payload, options);
    if (recovered) {
      return recovered;
    }
    throw new QuizCreatorApiError(
      "Network error while creating the quiz. Check Canvas for a duplicate before retrying.",
    );
  }

  if (response.ok) {
    const data = (await response.json()) as {
      id: number;
      title: string;
      warnings?: string[];
    };
    return {
      id: data.id,
      title: data.title,
      warnings: data.warnings ?? [],
    };
  }

  // 5xx / transport-ish failures may mean Canvas created the quiz but the
  // response never arrived. Look for a matching quiz before surfacing failure.
  if (response.status >= 500 || response.status === 0) {
    const recovered = await recoverCreatedQuiz(payload, options);
    if (recovered) {
      return recovered;
    }
  }

  throw new QuizCreatorApiError(await parseApiError(response));
}

async function recoverCreatedQuiz(
  payload: QuizApprovePayload,
  options: ApproveQuizDraftOptions,
): Promise<{ id: number; title: string; warnings: string[] } | null> {
  try {
    const listResponse = await fetch(
      appendCanvasUrl(
        `${API_BASE_URL}/canvas/courses/${payload.courseId}/quizzes`,
        options.canvasUrl,
      ),
      {
        headers: { Authorization: `Bearer ${options.accessToken}` },
      },
    );
    if (!listResponse.ok) {
      return null;
    }
    const quizzes = (await listResponse.json()) as Array<{
      id: number;
      title: string;
      description?: string | null;
      due_at?: string | null;
      points_possible?: number | null;
      question_count?: number | null;
      warnings?: string[];
    }>;
    const duePrefix = payload.dueDate.slice(0, 10);
    const expectedQuestionCount =
      payload.questions.length +
      (payload.questionBankGroups ?? []).reduce(
        (total, group) => total + group.pickCount,
        0,
      );
    const match = quizzes.find((quiz) => {
      if (quiz.title !== payload.name) {
        return false;
      }
      if (
        payload.pointsPossible != null &&
        quiz.points_possible != null &&
        Math.abs(Number(quiz.points_possible) - payload.pointsPossible) > 0.01
      ) {
        return false;
      }
      if (
        quiz.description != null &&
        quiz.description.trim() !== "" &&
        quiz.description.trim() !== payload.description.trim()
      ) {
        return false;
      }
      if (
        quiz.question_count != null &&
        quiz.question_count !== expectedQuestionCount
      ) {
        return false;
      }
      if (!quiz.due_at) {
        return true;
      }
      return quiz.due_at.slice(0, 10) === duePrefix;
    });
    if (!match) {
      return null;
    }
    return {
      id: match.id,
      title: match.title,
      warnings: match.warnings ?? [
        "Recovered an existing Canvas quiz that matched this draft after a failed create response.",
      ],
    };
  } catch {
    return null;
  }
}

export async function fetchQuizCapabilities(
  courseId: number,
  options: GenerateQuizDraftOptions,
): Promise<QuizCapabilities> {
  const response = await fetch(
    appendCanvasUrl(
      `${API_BASE_URL}/canvas/courses/${courseId}/quizzes/capabilities`,
      options.canvasUrl,
    ),
    {
      headers: { Authorization: `Bearer ${options.accessToken}` },
    },
  );
  if (!response.ok) {
    throw new QuizCreatorApiError(await parseApiError(response));
  }
  const data = (await response.json()) as {
    classic_quizzes: boolean;
    new_quizzes: boolean;
    question_banks: boolean;
    preferred_engine: QuizCapabilities["preferredEngine"];
    new_quizzes_unavailable_reason?: string | null;
  };
  return {
    classicQuizzes: data.classic_quizzes,
    newQuizzes: data.new_quizzes,
    questionBanks: data.question_banks,
    preferredEngine: data.preferred_engine,
    newQuizzesUnavailableReason:
      data.new_quizzes_unavailable_reason ?? undefined,
  };
}

export async function fetchQuestionBanks(
  courseId: number,
  options: GenerateQuizDraftOptions,
): Promise<QuizQuestionBank[]> {
  const response = await fetch(
    appendCanvasUrl(
      `${API_BASE_URL}/canvas/courses/${courseId}/quizzes/question-banks`,
      options.canvasUrl,
    ),
    {
      headers: { Authorization: `Bearer ${options.accessToken}` },
    },
  );
  if (!response.ok) {
    throw new QuizCreatorApiError(await parseApiError(response));
  }
  const data = (await response.json()) as Array<{
    id: number;
    title: string;
    question_count: number;
  }>;
  return data.map((bank) => ({
    id: bank.id,
    title: bank.title,
    questionCount: bank.question_count,
  }));
}
