import { apiRequest } from "@/lib/api-request";
import type { LatestHealthResponse } from "@/services/systemHealth";

export const DIAGNOSTICS_PATH = "/admin/troubleshoot/diagnostics";

export interface FailingCanvasConnection {
  user_name: string;
  user_email: string;
  canvas_url: string;
  error_detail: string | null;
}

export interface InstructorCanvasSummary {
  total: number;
  healthy: number;
  failing: number;
  failing_connections: FailingCanvasConnection[];
}

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

export async function fetchDiagnostics(
  accessToken: string,
): Promise<DiagnosticsResponse> {
  return apiRequest<DiagnosticsResponse>(DIAGNOSTICS_PATH, accessToken);
}
