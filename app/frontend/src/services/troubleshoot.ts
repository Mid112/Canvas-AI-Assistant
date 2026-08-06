// Frontend service note: wraps troubleshoot API calls and normalizes payloads for route/components.

import { apiRequest } from "@/lib/api-request";
import type { LatestHealthResponse } from "@/services/systemHealth";

export const DIAGNOSTICS_PATH = "/admin/troubleshoot/diagnostics";

export interface FailingCanvasConnection {
  user_id: number;
  user_name: string;
  user_email: string;
  canvas_url: string;
  human_summary: string;
  error_detail: string | null;
  // True only when the failure is an actual token problem an admin-side
  // token reset can fix -- not for transient Canvas outages.
  needs_token_reset: boolean;
}

export interface InstructorCanvasSummary {
  total: number;
  healthy: number;
  failing: number;
}

/** GET /admin/troubleshoot/instructor-canvas-connections response shape --
 * paginated separately from the rest of diagnostics so paging through
 * failing connections doesn't re-run the health/LLM-provider checks. */
export interface FailingCanvasConnectionListResponse {
  items: FailingCanvasConnection[];
  total: number;
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

export const FAILING_CANVAS_CONNECTIONS_PATH =
  "/admin/troubleshoot/instructor-canvas-connections";

export async function fetchFailingCanvasConnections(
  accessToken: string,
  options?: { limit?: number; offset?: number },
): Promise<FailingCanvasConnectionListResponse> {
  const params = new URLSearchParams();
  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  if (options?.offset !== undefined) {
    params.set("offset", String(options.offset));
  }
  const query = params.toString();
  return apiRequest<FailingCanvasConnectionListResponse>(
    `${FAILING_CANVAS_CONNECTIONS_PATH}${query ? `?${query}` : ""}`,
    accessToken,
  );
}
