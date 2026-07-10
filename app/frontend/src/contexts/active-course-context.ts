import { createContext } from "react";

import type { ActiveCourseSelection, InstructorCourse } from "@/types/course";

export interface ActiveCourseContextValue {
  activeCourse: ActiveCourseSelection | null;
  availableCourses: InstructorCourse[];
  /** Bumped after Canvas writes so course lists refetch fresh data. */
  coursesRevision: number;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  selectActiveCourse: (
    localCourseId: number,
    optimisticCourse?: InstructorCourse | ActiveCourseSelection,
  ) => Promise<boolean>;
  refreshActiveCourse: () => Promise<void>;
  /** Ask course pages to reload from Canvas without duplicating provider state. */
  notifyCoursesChanged: () => void;
}

export const ActiveCourseContext = createContext<ActiveCourseContextValue | null>(
  null,
);
