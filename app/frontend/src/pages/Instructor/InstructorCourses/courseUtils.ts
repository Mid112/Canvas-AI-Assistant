import type { InstructorCourse } from "@/types/course";

export function filterInstructorCourses(
  courses: InstructorCourse[],
  search: string,
): InstructorCourse[] {
  const query = search.trim().toLowerCase();

  if (query.length === 0) {
    return courses;
  }

  return courses.filter((course) =>
    `${course.code} ${course.name}`.toLowerCase().includes(query),
  );
}

export function sortInstructorCourses(
  courses: InstructorCourse[],
): InstructorCourse[] {
  return [...courses].sort((a, b) =>
    `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`),
  );
}
