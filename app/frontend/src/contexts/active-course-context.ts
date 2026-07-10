import { createContext } from "react";

import type { ActiveCourseSelection, InstructorCourse } from "@/types/course";

export interface ActiveCourseContextValue {
  activeCourse: ActiveCourseSelection | null;
  availableCourses: InstructorCourse[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  selectActiveCourse: (
    localCourseId: number,
    optimisticCourse?: InstructorCourse | ActiveCourseSelection,
  ) => Promise<boolean>;
  refreshActiveCourse: () => Promise<void>;
}

export const ActiveCourseContext = createContext<ActiveCourseContextValue | null>(
  null,
);
