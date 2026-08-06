// Frontend helper note: centralizes format course title behavior so components and tests share one implementation.

function normalizeCourseLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function formatInstructorCourseTitle(course: {
  code: string;
  name: string;
}): string {
  const code = course.code.trim();
  const name = course.name.trim();

  if (!code) {
    return name;
  }

  if (!name || normalizeCourseLabel(code) === normalizeCourseLabel(name)) {
    return code;
  }

  const normalizedCode = normalizeCourseLabel(code);
  const normalizedName = normalizeCourseLabel(name);

  if (
    normalizedName.startsWith(`${normalizedCode}:`) ||
    normalizedName.startsWith(`${normalizedCode} -`)
  ) {
    return name;
  }

  return `${code}: ${name}`;
}
