import { apiRequest } from "@/lib/api-request";

export const FAILED_OPERATIONS_PATH = "/admin/failed-operations";

export type FailedOperationSource = "canvas" | "ai";

/** List-endpoint shape — metadata + a plain-language summary only. Raw
 * error_detail/context_json are FERPA-sensitive and only ever returned by
 * the single-item detail endpoint (see FailedOperationDetail below), which
 * access-logs the view server-side. */
export interface FailedOperation {
  id: number;
  source: FailedOperationSource;
  operation: string;
  user_id: number | null;
  user_name: string | null;
  course_id: number | null;
  conversation_id: number | null;
  workflow_id: number | null;
  tool_call_id: number | null;
  provider: string | null;
  human_summary: string;
  created_at: string;
}

/** GET /admin/failed-operations/{id} response shape — adds the raw fields.
 * Fetching this is itself an access-logged action on the backend. */
export interface FailedOperationDetail extends FailedOperation {
  error_detail: string;
  context_json: Record<string, unknown>;
}

export interface FailedOperationListResponse {
  items: FailedOperation[];
  total: number;
  canvas_count: number;
  ai_count: number;
}

export interface FailedOperationSummaryResponse {
  total: number;
  canvas_count: number;
  ai_count: number;
  hours: number;
}

export async function fetchFailedOperationsSummary(
  accessToken: string,
  hours = 24,
): Promise<FailedOperationSummaryResponse> {
  return apiRequest<FailedOperationSummaryResponse>(
    `${FAILED_OPERATIONS_PATH}/summary?hours=${hours}`,
    accessToken,
  );
}

export async function fetchFailedOperations(
  accessToken: string,
  options?: {
    source?: FailedOperationSource;
    hours?: number;
    limit?: number;
    offset?: number;
  },
): Promise<FailedOperationListResponse> {
  const params = new URLSearchParams();
  if (options?.source) {
    params.set("source", options.source);
  }
  if (options?.hours !== undefined) {
    params.set("hours", String(options.hours));
  }
  if (options?.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  if (options?.offset !== undefined) {
    params.set("offset", String(options.offset));
  }

  const query = params.toString();
  return apiRequest<FailedOperationListResponse>(
    `${FAILED_OPERATIONS_PATH}${query ? `?${query}` : ""}`,
    accessToken,
  );
}

export async function fetchFailedOperation(
  accessToken: string,
  id: number,
): Promise<FailedOperationDetail> {
  return apiRequest<FailedOperationDetail>(`${FAILED_OPERATIONS_PATH}/${id}`, accessToken);
}
