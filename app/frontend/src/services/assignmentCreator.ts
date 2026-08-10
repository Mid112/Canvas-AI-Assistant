import { API_BASE_URL } from "@/config/api";
import { parseApiError } from "@/lib/api-request";
import { formatDueDateForApi, formatDueDateForInput } from "@/lib/assignment-utils";
import { toModelSettingsPayload } from "@/lib/llm-provider-storage";
import { createAssignment } from "@/services/assignments";
import type { AssignmentCreatePayload } from "@/types/assignment";
import type { LlmProviderSettings } from "@/types/llmProvider";
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

function defaultDueDate(timeZone?: string): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  date.setHours(23, 59, 0, 0);
  return formatDueDateForInput(date.toISOString(), timeZone);
}

interface GenerateAssignmentDraftOptions {
  accessToken: string;
  canvasUrl?: string;
  timeZone?: string;
  /** The instructor's chosen provider/model. Without it the generator falls
   * back to the deployment's provider, which is not necessarily one they have
   * connected a key to. */
  modelSettings?: LlmProviderSettings | null;
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
      body: JSON.stringify({
        prompt,
        model_settings: toModelSettingsPayload(options.modelSettings),
      }),
    },
  );

  if (!response.ok) {
    throw new AssignmentCreatorApiError(await parseApiError(response));
  }

  const data = (await response.json()) as AssignmentDraftApiResponse;

  return {
    name: data.title,
    description: data.description,
    dueDate: data.due_at
      ? formatDueDateForInput(data.due_at, options.timeZone)
      : defaultDueDate(options.timeZone),
    // Ticket 21: preserve null for ungraded — never invent 10/100.
    pointsPossible:
      typeof data.points_possible === "number" &&
      Number.isFinite(data.points_possible) &&
      data.points_possible > 0
        ? data.points_possible
        : null,
  };
}

export function toAssignmentCreateRequest(
  payload: AssignmentApprovePayload,
  timeZone?: string,
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
      due_at: payload.dueDate ? formatDueDateForApi(payload.dueDate, timeZone) : null,
      points_possible: payload.pointsPossible,
    },
  };
}

interface AssignmentPreviewApiResponse {
  summary: string;
  reversible: boolean;
  affected_resources: { type: string; name: string }[];
  metadata?: {
    title?: string;
    description_preview?: string;
    due_date?: string;
    points_possible?: string;
  };
}

interface PreviewAssignmentDraftOptions {
  accessToken: string;
  canvasUrl?: string;
  timeZone?: string;
}

/** Calls the backend's dry-run preview endpoint — the same explicit-confirmation
 * step every other Canvas-mutating action goes through before this fix. */
export async function previewAssignmentDraft(
  payload: AssignmentApprovePayload,
  options: PreviewAssignmentDraftOptions,
): Promise<AssignmentPreviewSummary> {
  const request = toAssignmentCreateRequest(payload, options.timeZone);

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
  const metadata = data.metadata ?? {};

  return {
    summary: data.summary,
    reversible: data.reversible,
    affectedResources: data.affected_resources,
    title: metadata.title,
    descriptionPreview: metadata.description_preview,
    dueDate: metadata.due_date,
    pointsPossible: metadata.points_possible,
  };
}

interface ApproveAssignmentDraftOptions {
  accessToken: string;
  canvasUrl?: string;
  /** Set when the draft came from an assistant intent_preview, so the
   * pending Workflow chat opened for it gets closed out and audited. */
  conversationId?: number;
  pendingMessageId?: number;
  timeZone?: string;
}

export async function approveAssignmentDraft(
  payload: AssignmentApprovePayload,
  options: ApproveAssignmentDraftOptions,
): Promise<void> {
  const request = toAssignmentCreateRequest(payload, options.timeZone);
  // Omitted entirely on the plain "+ Create Assignment" path so that call
  // keeps its original shape — there is no preview to close out there.
  const workflowLink =
    options.conversationId != null && options.pendingMessageId != null
      ? {
          conversationId: options.conversationId,
          pendingMessageId: options.pendingMessageId,
        }
      : undefined;
  await createAssignment(
    request.courseId,
    request.assignment,
    options.accessToken,
    options.canvasUrl,
    workflowLink,
  );
}
