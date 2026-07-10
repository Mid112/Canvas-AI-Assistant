import { createContext } from "react";

import type { ActiveCourseSelection, InstructorCourse } from "@/types/course";

export interface ActiveCourseContextValue {
  activeCourse: ActiveCourseSelection | null;
  availableCourses: InstructorCourse[];
  isLoading: boolean;
  /** True once the first course-list fetch attempt has completed (success
   * or failure) — never reset back to false afterward. Distinct from
   * isLoading, which also flips true on a manual refresh; consumers that
   * only want to gate first-paint (spinner vs. empty vs. list) should use
   * this instead of isLoading. */
  isLoaded: boolean;
  isSaving: boolean;
  error: string | null;
  /** True when there's no configured Canvas connection for the current
   * institution, or the last fetch failed because Canvas access hasn't been
   * set up yet — distinct from `error`, which is for unexpected failures. */
  needsCanvasConnection: boolean;
  selectActiveCourse: (
    localCourseId: number,
    optimisticCourse?: InstructorCourse | ActiveCourseSelection,
  ) => Promise<boolean>;
  refreshActiveCourse: () => Promise<void>;
}

export const ActiveCourseContext = createContext<ActiveCourseContextValue | null>(
  null,
);
