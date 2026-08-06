// File note: persists content-only assistant drafts; Canvas/local identifiers stay out of localStorage and course IDs are re-resolved from labels at resume time.

import { instructorMessagesPath, paths } from "@/routes/paths";
import type { QuizEngine, QuizQuestionDraft } from "@/types/quizCreate";

const TYPED_DRAFT_PREFIX = "assistant-typed-drafts:";

export type TypedDraftKind =
  | "assignment"
  | "message"
  | "quiz"
  | "announcement"
  | "feedback";

/** Content-only drafts — no Canvas / local course identifiers (#1239). */
export interface TypedDraftContent {
  title?: string;
  body?: string;
  /** Quiz drafts only, prompt-only path — free-text questions typed before
   * generation. Left as a plain string because there is no structured draft
   * yet to preserve; see quizQuestions for a resumable generated quiz. */
  questions?: string;
  feedback?: string;
  grade?: string;
  studentName?: string;
  assignmentName?: string;
  /** Assignment and quiz drafts — an ISO 8601 string, same shape as
   * GeneratedAssignmentDraft.dueDate / GeneratedQuizDraft.dueDate. Not a
   * Canvas identifier, so it's safe to persist alongside title/description. */
  dueDate?: string;
  /** Mirrors GeneratedAssignmentDraft.pointsPossible / GeneratedQuizDraft.
   * pointsPossible, including the assignment side's null: null means an
   * ungraded assignment (Ticket 21), a value the instructor chose rather
   * than "no points on this draft". Narrowing it to number made saving an
   * ungraded assignment draft a type error, since that is exactly what the
   * create page hands over. */
  pointsPossible?: number | null;
  /** Quiz drafts only — the generated question set, preserved as structured
   * data instead of being flattened to text (#1505). A resumed draft that
   * carries real questions here is what lets the create page recognise it
   * as already-generated and land back on review instead of describe. */
  quizQuestions?: QuizQuestionDraft[];
  /** Quiz drafts only, alongside quizQuestions — the remaining
   * GeneratedQuizDraft fields the review step needs to reconstruct the
   * draft exactly rather than falling back to defaults. */
  quizEngine?: QuizEngine;
  /** Content-only bank picks — bankName + counts/points, never Canvas bankId (#1239 / #1505). */
  quizQuestionBankGroups?: Array<{
    bankName: string;
    pickCount: number;
    questionPoints: number;
  }>;
  /** Quiz drafts only. Both mirror GeneratedQuizDraft, including the null:
   * null is a real instructor choice (unlimited attempts / no time limit),
   * distinct from the field being absent because the draft never set it.
   * Settings rather than content, but they are the instructor's own numbers
   * and carry no Canvas identifier, so they belong here with dueDate and
   * pointsPossible. */
  allowedAttempts?: number | null;
  timeLimit?: number | null;
  /** Quiz drafts only (#1506) — per-question points from a scored draft, kept
   * even when questions are stored as free text so a resume → Generate with
   * the same question count can restore the prior allocation instead of the
   * model's fresh 5-pt defaults. */
  questionPoints?: number[];
  /** The course the draft was written against, stored as the two display
   * strings Canvas shows for it rather than any id. #1239 keeps Canvas and
   * local identifiers out of local storage; these are labels, the same
   * category as studentName / assignmentName above, so they stay within it.
   *
   * Both are kept because either one can change on its own: a course renamed
   * between save and resume still resolves on its code, and a re-coded one
   * still resolves on its name. See resolveTypedDraftCourseId. */
  courseCode?: string;
  courseName?: string;
}

/** The subset of InstructorCourse resolveTypedDraftCourseId needs — kept
 * structural so callers can pass their own already-filtered lists (e.g. only
 * writable courses) without this module depending on course types. */
export interface TypedDraftCourseCandidate {
  id: number;
  code: string;
  name: string;
}

export interface TypedDraft {
  id: string;
  kind: TypedDraftKind;
  content: TypedDraftContent;
  savedAt: string;
}

export interface BuildTypedDraftResumeOptions {
  /** Local course id the resumed form should open on. Callers resolve this
   * from the draft's own course labels first and only fall back to the active
   * course — see resolveTypedDraftCourseId. Seeds the form; never persisted. */
  courseId?: number;
}

const KIND_LABELS: Record<TypedDraftKind, string> = {
  assignment: "Assignment",
  message: "Message",
  quiz: "Quiz",
  announcement: "Announcement",
  feedback: "Feedback",
};

export function typedDraftKindLabel(kind: TypedDraftKind): string {
  return KIND_LABELS[kind];
}

function storageKey(userId: number): string {
  return `${TYPED_DRAFT_PREFIX}${userId}`;
}

function stripCanvasIdentifiers(
  content: TypedDraftContent,
): TypedDraftContent {
  // Defensive copy: never persist keys that look like Canvas/course ids.
  const {
    title,
    body,
    questions,
    feedback,
    grade,
    studentName,
    assignmentName,
    dueDate,
    pointsPossible,
    quizQuestions,
    quizEngine,
    quizQuestionBankGroups,
    allowedAttempts,
    timeLimit,
    questionPoints,
    courseCode,
    courseName,
  } = content;
  return {
    ...(title !== undefined ? { title } : {}),
    ...(body !== undefined ? { body } : {}),
    ...(questions !== undefined ? { questions } : {}),
    ...(feedback !== undefined ? { feedback } : {}),
    ...(grade !== undefined ? { grade } : {}),
    ...(studentName !== undefined ? { studentName } : {}),
    ...(assignmentName !== undefined ? { assignmentName } : {}),
    ...(dueDate !== undefined ? { dueDate } : {}),
    ...(pointsPossible !== undefined ? { pointsPossible } : {}),
    ...(quizQuestions !== undefined ? { quizQuestions } : {}),
    ...(quizEngine !== undefined ? { quizEngine } : {}),
    // Persist bank picks by name only — never Canvas bankId (#1239 / #1505).
    ...(quizQuestionBankGroups !== undefined
      ? {
          quizQuestionBankGroups: quizQuestionBankGroups.map((group) => ({
            bankName: group.bankName,
            pickCount: group.pickCount,
            questionPoints: group.questionPoints,
          })),
        }
      : {}),
    // Tested against undefined, not truthiness: 0 attempts and a null
    // "no time limit" are both values the instructor chose and must survive.
    ...(allowedAttempts !== undefined ? { allowedAttempts } : {}),
    ...(timeLimit !== undefined ? { timeLimit } : {}),
    ...(questionPoints !== undefined ? { questionPoints } : {}),
    ...(courseCode !== undefined ? { courseCode } : {}),
    ...(courseName !== undefined ? { courseName } : {}),
  };
}

function normalizeCourseLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchUniqueCourse(
  courses: TypedDraftCourseCandidate[],
  label: string | undefined,
  pick: (course: TypedDraftCourseCandidate) => string,
): number | undefined {
  const target = label ? normalizeCourseLabel(label) : "";
  if (!target) {
    return undefined;
  }
  const matches = courses.filter(
    (course) => normalizeCourseLabel(pick(course)) === target,
  );
  // Two courses sharing a code (or a name) cannot be told apart from a label
  // alone, so an ambiguous hit resolves to nothing rather than to a guess.
  return matches.length === 1 ? matches[0].id : undefined;
}

/** Resolves a saved draft back to the course it was written for.
 *
 * Drafts persist labels, not ids (#1239), so the id has to be recovered from
 * the current course list at resume time. Code is tried before name because
 * it is the more stable of the two — instructors rename a course far more
 * often than they re-code it.
 *
 * Returns undefined when neither label matches exactly one course: the course
 * may have been deleted, unpublished out of the caller's list, or renamed on
 * both halves at once. Callers fall back to the active course there, which is
 * the only remaining signal. */
export function resolveTypedDraftCourseId(
  content: TypedDraftContent,
  courses: TypedDraftCourseCandidate[],
): number | undefined {
  return (
    matchUniqueCourse(courses, content.courseCode, (course) => course.code) ??
    matchUniqueCourse(courses, content.courseName, (course) => course.name)
  );
}

function writeDrafts(userId: number, drafts: TypedDraft[]): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(drafts));
  } catch {
    // Quota / private mode — avoid uncaught setItem failures.
  }
}

export function listTypedDrafts(userId: number): TypedDraft[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TypedDraft[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry) =>
        entry &&
        typeof entry.id === "string" &&
        typeof entry.kind === "string" &&
        entry.content &&
        typeof entry.content === "object",
    );
  } catch {
    return [];
  }
}

export function saveTypedDraft(
  userId: number,
  draft: Omit<TypedDraft, "savedAt" | "id"> & { id?: string },
): TypedDraft {
  const next: TypedDraft = {
    id: draft.id ?? crypto.randomUUID(),
    kind: draft.kind,
    content: stripCanvasIdentifiers(draft.content),
    savedAt: new Date().toISOString(),
  };
  const existing = listTypedDrafts(userId).filter((entry) => entry.id !== next.id);
  writeDrafts(userId, [next, ...existing]);
  return next;
}

export function discardTypedDraft(userId: number, draftId: string): void {
  const remaining = listTypedDrafts(userId).filter((entry) => entry.id !== draftId);
  writeDrafts(userId, remaining);
}

export function typedDraftPreviewText(draft: TypedDraft): string {
  const { content } = draft;
  return (
    content.title ||
    content.assignmentName ||
    content.body ||
    content.feedback ||
    content.questions ||
    `${typedDraftKindLabel(draft.kind)} draft`
  );
}

function joinDescribePrompt(parts: Array<string | undefined>): string {
  return parts.map((part) => part?.trim()).filter(Boolean).join("\n\n");
}

/** Resume routes into the matching create/compose surface with content-only seed.
 * Callers must ensure an active course is selected before navigation.
 * Does not discard the draft — callers discard after successful Canvas confirm. */
export function buildTypedDraftResumeTarget(
  draft: TypedDraft,
  options?: BuildTypedDraftResumeOptions,
): {
  path: string;
  state: Record<string, unknown>;
} {
  const courseId = options?.courseId;
  const typedDraftId = draft.id;

  switch (draft.kind) {
    case "quiz": {
      const hasStructuredQuestions =
        Array.isArray(draft.content.quizQuestions) &&
        draft.content.quizQuestions.length > 0;
      if (hasStructuredQuestions) {
        // A draft saved after generation carries its own structured
        // questions — land straight on review with them instead of
        // re-describing a quiz that was already built (#1505).
        return {
          path: paths.instructor.quizCreate,
          state: {
            typedDraftId,
            aiQuizDraft: {
              ...(courseId !== undefined ? { courseId } : {}),
              name: draft.content.title ?? "",
              description: draft.content.body ?? "",
              questions: draft.content.quizQuestions,
              ...(draft.content.dueDate !== undefined
                ? { dueDate: draft.content.dueDate }
                : {}),
              ...(draft.content.pointsPossible !== undefined
                ? { pointsPossible: draft.content.pointsPossible }
                : {}),
              ...(draft.content.allowedAttempts !== undefined
                ? { allowedAttempts: draft.content.allowedAttempts }
                : {}),
              ...(draft.content.timeLimit !== undefined
                ? { timeLimit: draft.content.timeLimit }
                : {}),
              ...(draft.content.quizEngine !== undefined
                ? { quizEngine: draft.content.quizEngine }
                : {}),
              ...(draft.content.quizQuestionBankGroups !== undefined
                ? {
                    // bankId is resolved on the create page after banks load
                    // (content-only drafts store bankName, never Canvas ids).
                    questionBankGroups: draft.content.quizQuestionBankGroups.map(
                      (group) => ({
                        bankId: 0,
                        bankName: group.bankName,
                        pickCount: group.pickCount,
                        questionPoints: group.questionPoints,
                      }),
                    ),
                  }
                : {}),
            },
          },
        };
      }
      // Typed drafts without structured questions only have free-text —
      // land on describe so the create page can generate structured
      // questions (pages ignore questionsText).
      const prompt = joinDescribePrompt([
        draft.content.title
          ? `Create a quiz titled "${draft.content.title}"`
          : undefined,
        draft.content.body,
        draft.content.questions,
      ]);
      return {
        path: paths.instructor.quizCreate,
        state: {
          typedDraftId,
          aiQuizDraft: {
            ...(courseId !== undefined ? { courseId } : {}),
            name: draft.content.title ?? "",
            description: draft.content.body ?? "",
            ...(prompt ? { prompt } : {}),
            // Carried even though this resumes at describe: the create page
            // reapplies them after regenerating, so the instructor's own
            // attempt and time-limit choices are not replaced by whatever
            // the generator happens to default to.
            ...(draft.content.allowedAttempts !== undefined
              ? { allowedAttempts: draft.content.allowedAttempts }
              : {}),
            ...(draft.content.timeLimit !== undefined
              ? { timeLimit: draft.content.timeLimit }
              : {}),
            // Ticket 45 / #1506: carry prior per-question points so Generate
            // after resume can restore them when the question count matches.
            ...(Array.isArray(draft.content.questionPoints) &&
            draft.content.questionPoints.length > 0
              ? { priorQuestionPoints: draft.content.questionPoints }
              : {}),
            ...(draft.content.pointsPossible !== undefined
              ? { pointsPossible: draft.content.pointsPossible }
              : {}),
          },
        },
      };
    }
    case "assignment": {
      // Prompt-only saves (describe step before generation) have no title —
      // resume to describe with prompt, matching quiz/feedback.
      const hasGeneratedTitle = Boolean(draft.content.title?.trim());
      if (!hasGeneratedTitle) {
        const prompt = draft.content.body?.trim() ?? "";
        return {
          path: paths.instructor.assignmentCreate,
          state: {
            typedDraftId,
            aiAssignmentDraft: {
              ...(courseId !== undefined ? { courseId } : {}),
              name: "",
              description: "",
              ...(prompt ? { prompt } : {}),
            },
          },
        };
      }
      return {
        path: paths.instructor.assignmentCreate,
        state: {
          typedDraftId,
          aiAssignmentDraft: {
            ...(courseId !== undefined ? { courseId } : {}),
            name: draft.content.title ?? "",
            description: draft.content.body ?? "",
            ...(draft.content.dueDate !== undefined
              ? { dueDate: draft.content.dueDate }
              : {}),
            ...(draft.content.pointsPossible !== undefined
              ? { pointsPossible: draft.content.pointsPossible }
              : {}),
          },
        },
      };
    }
    case "feedback": {
      // Content-only drafts have no Canvas assignment/student ids — omit them
      // so the create page resumes at describe instead of Number(undefined).
      const prompt = joinDescribePrompt([
        draft.content.assignmentName
          ? `Assignment: ${draft.content.assignmentName}`
          : undefined,
        draft.content.studentName
          ? `Student: ${draft.content.studentName}`
          : undefined,
        draft.content.grade ? `Grade: ${draft.content.grade}` : undefined,
        draft.content.feedback,
      ]);
      return {
        path: paths.instructor.feedbackCreate,
        state: {
          typedDraftId,
          aiFeedbackDraft: {
            ...(courseId !== undefined ? { courseId } : {}),
            assignmentName: draft.content.assignmentName ?? "",
            studentName: draft.content.studentName ?? "",
            newGrade: draft.content.grade ?? "",
            feedback: draft.content.feedback ?? "",
            ...(prompt ? { prompt } : {}),
          },
        },
      };
    }
    case "announcement":
    case "message":
    default:
      return {
        path: instructorMessagesPath({ tab: "compose" }),
        state: {
          typedDraftId,
          aiMessageDraft: {
            ...(courseId !== undefined ? { courseId } : {}),
            subject: draft.content.title ?? "",
            body: draft.content.body ?? "",
          },
        },
      };
  }
}
