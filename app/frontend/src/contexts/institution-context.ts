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
}

export const InstitutionContext =
  createContext<InstitutionContextValue | null>(null);
