import { apiRequest } from "@/lib/api-request";

export const SYSTEM_HEALTH_PATH = "/admin/health";
export const SYSTEM_HEALTH_LATEST_PATH = "/admin/health/latest";
export const SYSTEM_HEALTH_HISTORY_PATH = "/admin/health/history";

export type HealthStatus = "healthy" | "degraded" | "down";

export interface ServiceHealth {
  status: HealthStatus;
  latency_ms: number | null;
  error_detail: string | null;
  uptime_seconds: number | null;
}

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

export interface InstructorAiSummary {
  total: number;
  failing_recent: number;
}

export interface ServiceMap {
  backend: ServiceHealth;
  database: ServiceHealth;
  canvas: ServiceHealth;
  ai: ServiceHealth;
}

export interface HealthCheckResponse {
  overall_status: HealthStatus;
  checked_at: string;
  services: ServiceMap;
  instructor_canvas: InstructorCanvasSummary;
  instructor_ai: InstructorAiSummary;
}

// Only ever returned by GET /admin/health/latest, for a fresh deploy (or
// after retention pruning) with no persisted health_checks rows yet -- a
// distinct state from a confirmed "healthy" run.
export type LatestOverallStatus = HealthStatus | "unknown";

export interface LatestHealthResponse {
  overall_status: LatestOverallStatus;
  checked_at: string | null;
  services: Partial<ServiceMap>;
}

export interface HealthHistoryEntry {
  status: HealthStatus;
  latency_ms: number | null;
  checked_at: string;
}

export interface HealthHistoryResponse {
  services: Record<string, HealthHistoryEntry[]>;
}

export async function fetchSystemHealth(
  accessToken: string,
): Promise<HealthCheckResponse> {
  return apiRequest<HealthCheckResponse>(SYSTEM_HEALTH_PATH, accessToken);
}

/** Cheap: reads persisted state only, triggers no live checks. Meant to be
 * called on every admin page load to power the nav badge. */
export async function fetchLatestSystemHealth(
  accessToken: string,
): Promise<LatestHealthResponse> {
  return apiRequest<LatestHealthResponse>(SYSTEM_HEALTH_LATEST_PATH, accessToken);
}

export async function fetchSystemHealthHistory(
  accessToken: string,
  hours = 24,
): Promise<HealthHistoryResponse> {
  return apiRequest<HealthHistoryResponse>(
    `${SYSTEM_HEALTH_HISTORY_PATH}?hours=${hours}`,
    accessToken,
  );
}
