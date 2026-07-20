import { API_BASE_URL } from "@/config/api";
import { parseApiError } from "@/lib/api-request";
import type {
  FeedbackApprovePayload,
  FeedbackDescribeValues,
  FeedbackPreviewSummary,
  GeneratedFeedbackDraft,
} from "@/types/feedbackCreate";

export class FeedbackCreatorApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedbackCreatorApiError";
  }
}

function appendCanvasUrl(url: string, canvasUrl?: string): string {
  if (!canvasUrl) {
    return url;
  }
  return `${url}?${new URLSearchParams({ canvas_url: canvasUrl }).toString()}`;
}

interface FeedbackDraftApiResponse {
  assignment_id: number;
  student_id: number;
  assignment_name: string;
  student_name: string;
  new_grade: string;
  feedback: string;
  current_grade?: string | null;
}

interface GenerateFeedbackDraftOptions {
  accessToken: string;
  canvasUrl?: string;
  assignmentName: string;
  studentName: string;
}

export async function generateFeedbackDraft(
  courseId: number,
  values: FeedbackDescribeValues,
  options: GenerateFeedbackDraftOptions,
): Promise<GeneratedFeedbackDraft> {
  const response = await fetch(
    appendCanvasUrl(
      `${API_BASE_URL}/canvas/courses/${courseId}/feedback/generate-draft`,
      options.canvasUrl,
    ),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.accessToken}`,
      },
      body: JSON.stringify({
        prompt: values.prompt,
        assignment_id: Number(values.assignmentId),
        student_id: Number(values.studentId),
        assignment_name: options.assignmentName,
        student_name: options.studentName,
      }),
    },
  );

  if (!response.ok) {
    throw new FeedbackCreatorApiError(await parseApiError(response));
  }

  const data = (await response.json()) as FeedbackDraftApiResponse;
  return {
    assignmentId: data.assignment_id,
    studentId: data.student_id,
    assignmentName: data.assignment_name,
    studentName: data.student_name,
    newGrade: data.new_grade,
    feedback: data.feedback,
    currentGrade: data.current_grade,
  };
}

function toFeedbackPostBody(payload: FeedbackApprovePayload) {
  const courseId = Number(payload.courseId);
  if (!Number.isInteger(courseId) || courseId <= 0) {
    throw new FeedbackCreatorApiError("A valid course is required.");
  }

  return {
    courseId,
    body: {
      assignment_id: payload.assignmentId,
      student_id: payload.studentId,
      assignment_name: payload.assignmentName.trim(),
      student_name: payload.studentName.trim(),
      new_grade: payload.newGrade.trim(),
      feedback: payload.feedback.trim(),
    },
  };
}

interface PreviewFeedbackDraftOptions {
  accessToken: string;
  canvasUrl?: string;
}

export async function previewFeedbackDraft(
  payload: FeedbackApprovePayload,
  options: PreviewFeedbackDraftOptions,
): Promise<FeedbackPreviewSummary> {
  const request = toFeedbackPostBody(payload);
  const response = await fetch(
    appendCanvasUrl(
      `${API_BASE_URL}/canvas/courses/${request.courseId}/feedback/preview`,
      options.canvasUrl,
    ),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.accessToken}`,
      },
      body: JSON.stringify(request.body),
    },
  );

  if (!response.ok) {
    throw new FeedbackCreatorApiError(await parseApiError(response));
  }

  const data = (await response.json()) as {
    summary: string;
    reversible: boolean;
    risk_level?: "low" | "medium" | "high";
    affected_resources: { type: string; name: string }[];
  };

  return {
    summary: data.summary,
    reversible: data.reversible,
    riskLevel: data.risk_level ?? "medium",
    affectedResources: data.affected_resources,
  };
}

interface ApproveFeedbackDraftOptions {
  accessToken: string;
  canvasUrl?: string;
}

export async function approveFeedbackDraft(
  payload: FeedbackApprovePayload,
  options: ApproveFeedbackDraftOptions,
): Promise<void> {
  const request = toFeedbackPostBody(payload);
  const response = await fetch(
    appendCanvasUrl(
      `${API_BASE_URL}/canvas/courses/${request.courseId}/feedback`,
      options.canvasUrl,
    ),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.accessToken}`,
      },
      body: JSON.stringify(request.body),
    },
  );

  if (!response.ok) {
    throw new FeedbackCreatorApiError(await parseApiError(response));
  }
}
