import { instructorMessagesPath, paths } from "@/routes/paths";

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
  questions?: string;
  feedback?: string;
  grade?: string;
  studentName?: string;
  assignmentName?: string;
  /** Assignment drafts only — an ISO 8601 string, same shape as
   * GeneratedAssignmentDraft.dueDate. Not a Canvas identifier, so it's
   * safe to persist alongside title/description. */
  dueDate?: string;
  pointsPossible?: number;
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
      // Typed drafts store free-text questions only — land on describe so the
      // create page can regenerate structured questions (pages ignore questionsText).
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
