// Frontend service note: wraps course overview API calls and normalizes payloads for route/components.

import { apiRequest } from "@/lib/api-request";
import {
  mapCourseOverviewApiToData,
  type CourseOverviewApiResponse,
} from "@/lib/map-course-overview";
import type { CourseOverviewData } from "@/types/courseOverview";

export async function fetchCourseOverview(
  localCourseId: number,
  accessToken: string,
  canvasUrl: string,
): Promise<CourseOverviewData> {
  const params = new URLSearchParams({ canvas_url: canvasUrl });
  const path = `/canvas/courses/${localCourseId}/overview?${params.toString()}`;
  const response = await apiRequest<CourseOverviewApiResponse>(path, accessToken);
  return mapCourseOverviewApiToData(response);
}
