import { apiRequest } from "@/lib/api-request";

export const ADMIN_DASHBOARD_PATH = "/admin/dashboard";

export interface AdminDashboardStats {
  instructor_count: number;
  admin_count: number;
  active_workflows: number;
  audit_events_last_7_days: number;
}

export async function fetchAdminDashboard(
  accessToken: string,
): Promise<AdminDashboardStats> {
  return apiRequest<AdminDashboardStats>(ADMIN_DASHBOARD_PATH, accessToken);
}
