import { apiRequest } from "@/lib/api-request";
import type { InstructorCanvasSummary, LatestHealthResponse } from "@/services/systemHealth";

export const DIAGNOSTICS_PATH = "/admin/troubleshoot/diagnostics";
export const FAILED_OPERATIONS_PATH = "/admin/troubleshoot/failed-operations";

export interface LlmProviderStatus {
  id: string;
  name: string;
  hosting: "local" | "internet" | "custom";
  default_model: string;
  configured: boolean;
  status: "available" | "configured" | "unavailable" | "unconfigured";
  models: string[];
  detail: string | null;
}

export interface DiagnosticsResponse {
  canvas_api_url: string;
  backend_uptime_seconds: number;
  health: LatestHealthResponse;
  instructor_canvas: InstructorCanvasSummary;
  llm_providers: LlmProviderStatus[];
  recent_failed_operations_count: number;
}

export interface FailedOperation {
  id: number;
  action_name: string;
  user_name: string;
  user_email: string;
  course_name: string | null;
  error_detail: string | null;
  created_at: string;
  executed_at: string | null;
}

export interface FailedOperationListResponse {
  items: FailedOperation[];
  total: number;
}

export async function fetchDiagnostics(
  accessToken: string,
): Promise<DiagnosticsResponse> {
  return apiRequest<DiagnosticsResponse>(DIAGNOSTICS_PATH, accessToken);
}

export async function fetchFailedOperations(
  accessToken: string,
  { limit = 50, offset = 0 }: { limit?: number; offset?: number } = {},
): Promise<FailedOperationListResponse> {
  return apiRequest<FailedOperationListResponse>(
    `${FAILED_OPERATIONS_PATH}?limit=${limit}&offset=${offset}`,
    accessToken,
  );
}
