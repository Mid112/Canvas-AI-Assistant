import type { CoursePublishFilter, InstructorCourse } from "@/types/course";

export function filterInstructorCourses(
  courses: InstructorCourse[],
  search: string,
  publishFilter: CoursePublishFilter = "all",
): InstructorCourse[] {
  const query = search.trim().toLowerCase();

  return courses.filter((course) => {
    if (publishFilter === "published" && !course.isPublished) {
      return false;
    }
    if (publishFilter === "unpublished" && course.isPublished) {
      return false;
    }

    return (
      query.length === 0 ||
      `${course.code} ${course.name}`.toLowerCase().includes(query)
    );
  });
}

export function sortInstructorCourses(
  courses: InstructorCourse[],
): InstructorCourse[] {
  return [...courses].sort((a, b) =>
    `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`),
  );
}
