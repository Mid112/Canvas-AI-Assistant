import { createContext } from "react";

import type { ActiveCourse } from "@/types/canvas";
import type { InstructorCourse } from "@/types/course";

export interface ActiveCourseContextValue {
  activeCourse: ActiveCourse | null;
  availableCourses: InstructorCourse[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  selectActiveCourse: (localCourseId: number) => Promise<void>;
  refreshActiveCourse: () => Promise<void>;
}

export const ActiveCourseContext = createContext<ActiveCourseContextValue | null>(
  null,
);
