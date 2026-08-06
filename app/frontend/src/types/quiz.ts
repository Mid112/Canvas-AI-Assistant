// Type note: documents the quiz data contract shared by services, components, and tests.

export type QuizEngine = "classic" | "new_quizzes";

export interface Quiz {
  id: number;
  /** Canvas gradebook target — use this for marking, never classic quiz id alone. */
  assignment_id: number | null;
  title: string;
  description: string | null;
  due_at: string | null;
  points_possible: number | null;
  course_id: number;
  quiz_type: string | null;
  allowed_attempts: number | null;
  time_limit: number | null;
  published: boolean;
  question_count: number | null;
  html_url: string | null;
  quiz_engine: QuizEngine;
}
