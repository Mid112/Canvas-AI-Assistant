// Frontend service note: wraps quizzes API calls and normalizes payloads for route/components.

import { API_BASE_URL } from "@/config/api";
import type { Quiz, QuizEngine } from "@/types/quiz";

/**
 * Canvas quiz list / publish client.
 *
 * Quizzes use quiz-engine-specific APIs — do not call assignment publish
 * endpoints for these operations (Ticket 13).
 */
export class QuizApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "QuizApiError";
    this.status = status;
  }
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      detail?: string | Array<{ msg?: string }>;
    };

    if (typeof data.detail === "string") {
      return data.detail;
    }

    if (Array.isArray(data.detail) && data.detail.length > 0) {
      const firstMessage = data.detail.find(
        (item) => typeof item.msg === "string",
      )?.msg;

      if (firstMessage) {
        return firstMessage;
      }
    }
  } catch {
    // Fall through to default message.
  }

  return "Something went wrong. Please try again.";
}

function appendParams(
  url: string,
  params: Record<string, string | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `${url}?${query}` : url;
}

async function request<T>(
  url: string,
  accessToken: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new QuizApiError(await parseError(response), response.status);
  }

  return response.json() as Promise<T>;
}

export async function fetchCourseQuizzes(
  localCourseId: number,
  accessToken: string,
  canvasUrl?: string,
): Promise<Quiz[]> {
  return request<Quiz[]>(
    appendParams(`${API_BASE_URL}/canvas/courses/${localCourseId}/quizzes`, {
      canvas_url: canvasUrl,
    }),
    accessToken,
  );
}

/** Publish or unpublish a quiz via the quiz-engine-specific Canvas path. */
export async function setQuizPublished(
  localCourseId: number,
  quizId: number,
  published: boolean,
  accessToken: string,
  options?: {
    canvasUrl?: string;
    quizEngine?: QuizEngine;
  },
): Promise<Quiz> {
  return request<Quiz>(
    appendParams(
      `${API_BASE_URL}/canvas/courses/${localCourseId}/quizzes/${quizId}/publish`,
      {
        canvas_url: options?.canvasUrl,
        quiz_engine: options?.quizEngine ?? "classic",
      },
    ),
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify({ published }),
    },
  );
}

/** Gradebook writes must target this id, not the classic quiz id when they differ. */
export function quizGradebookAssignmentId(quiz: Quiz): number | null {
  if (quiz.assignment_id != null) {
    return quiz.assignment_id;
  }
  if (quiz.quiz_engine === "new_quizzes") {
    return quiz.id;
  }
  return null;
}
