import { API_BASE_URL } from "@/config/api";
import { parseApiError } from "@/lib/api-request";
import { formatDueDateForApi, formatDueDateForInput } from "@/lib/assignment-utils";
import { createAssignment } from "@/services/assignments";
import type { AssignmentCreatePayload } from "@/types/assignment";
import type {
  AssignmentApprovePayload,
  AssignmentPreviewSummary,
  GeneratedAssignmentDraft,
} from "@/types/assignmentCreate";

export class AssignmentCreatorApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssignmentCreatorApiError";
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

interface GenerateAssignmentDraftOptions {
  accessToken: string;
  canvasUrl?: string;
}

interface AssignmentDraftApiResponse {
  title: string;
  description: string;
  due_at: string | null;
  points_possible: number | null;
}

/** Calls the backend's LLM-backed draft generator — real model call, not a client-side mock. */
export async function generateAssignmentDraft(
  courseId: number,
  prompt: string,
  options: GenerateAssignmentDraftOptions,
): Promise<GeneratedAssignmentDraft> {
  const response = await fetch(
    appendCanvasUrl(
      `${API_BASE_URL}/canvas/courses/${courseId}/assignments/generate-draft`,
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
    throw new AssignmentCreatorApiError(await parseApiError(response));
  }

  const data = (await response.json()) as AssignmentDraftApiResponse;

  return {
    name: data.title,
    description: data.description,
    dueDate: data.due_at ? formatDueDateForInput(data.due_at) : defaultDueDate(),
    pointsPossible: data.points_possible ?? 100,
  };
}

export function toAssignmentCreateRequest(
  payload: AssignmentApprovePayload,
): { courseId: number; assignment: AssignmentCreatePayload } {
  const courseId = Number(payload.courseId);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    throw new AssignmentCreatorApiError("A valid course is required.");
  }

  return {
    courseId,
    assignment: {
      name: payload.name.trim(),
      description: payload.description.trim() || null,
      due_at: payload.dueDate ? formatDueDateForApi(payload.dueDate) : null,
    },
  };
}

interface AssignmentPreviewApiResponse {
  summary: string;
  reversible: boolean;
  affected_resources: { type: string; name: string }[];
}

interface PreviewAssignmentDraftOptions {
  accessToken: string;
  canvasUrl?: string;
}

/** Calls the backend's dry-run preview endpoint — the same explicit-confirmation
 * step every other Canvas-mutating action goes through before this fix. */
export async function previewAssignmentDraft(
  payload: AssignmentApprovePayload,
  options: PreviewAssignmentDraftOptions,
): Promise<AssignmentPreviewSummary> {
  const request = toAssignmentCreateRequest(payload);

  const response = await fetch(
    appendCanvasUrl(
      `${API_BASE_URL}/canvas/courses/${request.courseId}/assignments/preview`,
      options.canvasUrl,
    ),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.accessToken}`,
      },
      body: JSON.stringify(request.assignment),
    },
  );

  if (!response.ok) {
    throw new AssignmentCreatorApiError(await parseApiError(response));
  }

  const data = (await response.json()) as AssignmentPreviewApiResponse;

  return {
    summary: data.summary,
    reversible: data.reversible,
    affectedResources: data.affected_resources,
  };
}

interface ApproveAssignmentDraftOptions {
  accessToken: string;
  canvasUrl?: string;
}

export async function approveAssignmentDraft(
  payload: AssignmentApprovePayload,
  options: ApproveAssignmentDraftOptions,
): Promise<void> {
  const request = toAssignmentCreateRequest(payload);
  await createAssignment(
    request.courseId,
    request.assignment,
    options.accessToken,
    options.canvasUrl,
  );
}
