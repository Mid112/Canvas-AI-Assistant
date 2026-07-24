import { paths } from "@/routes/paths";

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
}

export interface TypedDraft {
  id: string;
  kind: TypedDraftKind;
  content: TypedDraftContent;
  savedAt: string;
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
  } = content;
  return {
    ...(title !== undefined ? { title } : {}),
    ...(body !== undefined ? { body } : {}),
    ...(questions !== undefined ? { questions } : {}),
    ...(feedback !== undefined ? { feedback } : {}),
    ...(grade !== undefined ? { grade } : {}),
    ...(studentName !== undefined ? { studentName } : {}),
    ...(assignmentName !== undefined ? { assignmentName } : {}),
  };
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
  localStorage.setItem(storageKey(userId), JSON.stringify([next, ...existing]));
  return next;
}

export function discardTypedDraft(userId: number, draftId: string): void {
  const remaining = listTypedDrafts(userId).filter((entry) => entry.id !== draftId);
  localStorage.setItem(storageKey(userId), JSON.stringify(remaining));
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

/** Resume routes into the matching create/compose surface with content-only seed.
 * Callers must ensure an active course is selected before navigation. */
export function buildTypedDraftResumeTarget(draft: TypedDraft): {
  path: string;
  state: Record<string, unknown>;
} {
  switch (draft.kind) {
    case "quiz":
      return {
        path: paths.instructor.quizCreate,
        state: {
          aiQuizDraft: {
            title: draft.content.title ?? "",
            description: draft.content.body ?? "",
            questionsText: draft.content.questions ?? "",
            requireCourseSelection: true,
          },
        },
      };
    case "assignment":
      return {
        path: paths.instructor.assignmentCreate,
        state: {
          aiAssignmentDraft: {
            title: draft.content.title ?? "",
            description: draft.content.body ?? "",
            requireCourseSelection: true,
          },
        },
      };
    case "feedback":
      return {
        path: paths.instructor.feedbackCreate,
        state: {
          aiFeedbackDraft: {
            assignmentName: draft.content.assignmentName ?? "",
            studentName: draft.content.studentName ?? "",
            newGrade: draft.content.grade ?? "",
            feedback: draft.content.feedback ?? "",
            requireCourseSelection: true,
          },
        },
      };
    case "announcement":
    case "message":
    default:
      return {
        path: paths.instructor.messages,
        state: {
          aiMessageDraft: {
            subject: draft.content.title ?? "",
            body: draft.content.body ?? "",
            isAnnouncement: draft.kind === "announcement",
            requireCourseSelection: true,
          },
        },
      };
  }
}
