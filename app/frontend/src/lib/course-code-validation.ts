// Frontend helper note: centralizes course code validation behavior so components and tests share one implementation.

const COURSE_CODE_PATTERN = /^[A-Za-z]{1,12}(?:\s?\d{2,4}[A-Za-z]?)?$/;

export const COURSE_CODE_HELP_TEXT =
  "Use a subject and number like COSC 499 or COSC499.";

export function validateCourseCode(courseCode: string): string | null {
  const trimmed = courseCode.trim();

  if (!trimmed) {
    return null;
  }

  if (!COURSE_CODE_PATTERN.test(trimmed)) {
    return COURSE_CODE_HELP_TEXT;
  }

  return null;
}
