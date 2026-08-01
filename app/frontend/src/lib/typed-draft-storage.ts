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
}

export interface TypedDraft {
  id: string;
  kind: TypedDraftKind;
  content: TypedDraftContent;
  savedAt: string;
}

export interface BuildTypedDraftResumeOptions {
  /** Active course local id — used to seed create forms, not persisted. */
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
  };
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
