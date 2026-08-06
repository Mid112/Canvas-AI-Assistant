import { apiRequest } from "@/lib/api-request";
import {
  mapInstructorDashboardApiToData,
  type InstructorDashboardApiResponse,
} from "@/lib/map-dashboard";
import type { InstructorDashboardData } from "@/types/dashboard";

export const INSTRUCTOR_DASHBOARD_PATH = "/canvas/dashboard";

export async function fetchInstructorDashboard(
  accessToken: string,
): Promise<InstructorDashboardData> {
  const response = await apiRequest<InstructorDashboardApiResponse>(
    INSTRUCTOR_DASHBOARD_PATH,
    accessToken,
  );

  return mapInstructorDashboardApiToData(response);
}
