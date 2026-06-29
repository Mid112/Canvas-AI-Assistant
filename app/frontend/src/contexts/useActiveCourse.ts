import { useContext } from "react";

import { ActiveCourseContext } from "@/contexts/active-course-context";

export function useActiveCourse() {
  const context = useContext(ActiveCourseContext);

  if (!context) {
    throw new Error("useActiveCourse must be used within an ActiveCourseProvider");
  }

  return context;
}
