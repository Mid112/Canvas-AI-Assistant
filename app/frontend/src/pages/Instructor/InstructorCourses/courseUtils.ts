import type {
  CoursePublishFilter,
  InstructorCourse,
} from "@/types/course";

export function coursePublishLabel(course: InstructorCourse): string {
  switch (course.workflowState) {
    case "available":
      return "Published";
    case "unpublished":
      return "Unpublished";
    case "completed":
      return "Completed";
    default:
      return "Unknown status";
  }
}

export function isCoursePublished(course: InstructorCourse): boolean {
  return course.workflowState === "available";
}

export function filterInstructorCourses(
  courses: InstructorCourse[],
  search: string,
  publishFilter: CoursePublishFilter = "all",
): InstructorCourse[] {
  const query = search.trim().toLowerCase();

  return courses.filter((course) => {
    if (publishFilter === "published" && course.workflowState !== "available") {
      return false;
    }
    if (
      publishFilter === "unpublished" &&
      course.workflowState !== "unpublished"
    ) {
      return false;
    }

    if (query.length === 0) {
      return true;
    }

    return `${course.code} ${course.name}`.toLowerCase().includes(query);
  });
}

export function sortInstructorCourses(
  courses: InstructorCourse[],
): InstructorCourse[] {
  const publishRank = (course: InstructorCourse): number => {
    switch (course.workflowState) {
      case "available":
        return 0;
      case "unpublished":
        return 1;
      case "completed":
        return 2;
      default:
        return 3;
    }
  };

  return [...courses].sort((a, b) => {
    const byStatus = publishRank(a) - publishRank(b);
    if (byStatus !== 0) {
      return byStatus;
    }
    return `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`);
  });
}
