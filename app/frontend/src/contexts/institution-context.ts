import { createContext } from "react";

import type {
  CourseAnalyticsOverview,
  InstructorCourse,
} from "@/types/course";
import type { InstructorDashboardData } from "@/types/dashboard";
import type { Institution } from "@/types/institution";

export interface InstitutionContextValue {
  institutions: Institution[];
  selectedInstitution: Institution;
  setSelectedInstitution: (institutionId: string) => void;
  courses: InstructorCourse[];
  analytics: CourseAnalyticsOverview;
  dashboard: InstructorDashboardData;
  /** Re-fetches dashboard metrics from the backend. InstitutionProvider is
   * mounted once for the whole session, so nothing re-triggers its initial
   * fetch on its own — callers that just committed a mutation (assignment
   * create, a confirmed chat action) must call this explicitly or the
   * dashboard numbers stay stale until a full page reload. */
  refreshDashboard: () => Promise<void>;
}

export const InstitutionContext =
  createContext<InstitutionContextValue | null>(null);
