import { useOutletContext } from "react-router-dom";

import type { InstructorCourseOutletContext } from "@/pages/Instructor/InstructorCourse/instructorCourseLayoutContext";

export function useInstructorCourseOutletContext():
  | InstructorCourseOutletContext
  | undefined {
  return useOutletContext<InstructorCourseOutletContext | undefined>();
}
