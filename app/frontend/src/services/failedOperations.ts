import { apiRequest } from "@/lib/api-request";

export const FAILED_OPERATIONS_PATH = "/admin/failed-operations";

export type FailedOperationSource = "canvas" | "ai";

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
  error_detail: string;
  context_json: Record<string, unknown>;
  created_at: string;
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
): Promise<FailedOperation> {
  return apiRequest<FailedOperation>(`${FAILED_OPERATIONS_PATH}/${id}`, accessToken);
}
