export interface QuizCreateCourseOption {
  id: string;
  label: string;
}

export interface QuizDescribeValues {
  courseId: string;
  prompt: string;
}

export interface QuizQuestionDraft {
  questionText: string;
  questionType:
    | "multiple_choice_question"
    | "true_false_question"
    | "short_answer_question"
    | "essay_question";
  pointsPossible: number;
  answers: { text: string; weight: number }[];
}

export type QuizEngine = "classic" | "new_quizzes";

export interface QuizQuestionBank {
  id: number;
  title: string;
  questionCount: number;
}

export interface QuizQuestionBankGroup {
  bankId: number;
  bankName: string;
  pickCount: number;
  questionPoints: number;
}

export interface QuizCapabilities {
  classicQuizzes: boolean;
  newQuizzes: boolean;
  questionBanks: boolean;
  preferredEngine: QuizEngine;
  newQuizzesUnavailableReason?: string;
}

export interface GeneratedQuizDraft {
  name: string;
  description: string;
  dueDate: string;
  pointsPossible: number;
  allowedAttempts: number | null;
  timeLimit: number | null;
  quizEngine?: QuizEngine;
  questions: QuizQuestionDraft[];
  questionBankGroups?: QuizQuestionBankGroup[];
}

export type QuizCreateStep = "describe" | "review";

export interface QuizApprovePayload {
  courseId: string;
  name: string;
  description: string;
  dueDate: string;
  pointsPossible: number;
  allowedAttempts: number | null;
  timeLimit: number | null;
  quizEngine?: QuizEngine;
  questions: QuizQuestionDraft[];
  questionBankGroups?: QuizQuestionBankGroup[];
}

export type QuizRiskLevel = "low" | "medium" | "high";

export interface QuizPreviewSummary {
  summary: string;
  reversible: boolean;
  riskLevel: QuizRiskLevel;
  affectedResources: { type: string; name: string }[];
  metadata: Record<string, unknown>;
}
