// Hook note: packages use instructor course outlet context state/effects for route components that need the same behavior.

import { useOutletContext } from "react-router-dom";

import type { InstructorCourseOutletContext } from "@/pages/Instructor/InstructorCourse/instructorCourseLayoutContext";

export function useInstructorCourseOutletContext():
  | InstructorCourseOutletContext
  | undefined {
  return useOutletContext<InstructorCourseOutletContext | undefined>();
}
