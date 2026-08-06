// Frontend helper note: centralizes disambiguate course labels behavior so components and tests share one implementation.

import { formatInstructorCourseTitle } from "@/lib/format-course-title";

type DisambiguableCourse = {
  id: number;
  code: string;
  name: string;
  term: string | null;
};

/**
 * Maps each course to a user-facing label, appending a disambiguator only
 * when two or more courses in the same list would otherwise render an
 * identical base label (formatInstructorCourseTitle(code, name)). Never
 * exposes a local or Canvas ID as visible text — that ID already lives
 * invisibly as the option value / route param, which is how a user "reaches"
 * a specific course; this only affects what they read on screen.
 *
 * Disambiguation order: term name (e.g. "Fall 2026") if the colliding
 * courses have distinct terms, otherwise a plain position suffix
 * ("(1)", "(2)") for the fully degenerate case where even the term matches.
 */
export function disambiguateCourseLabels(
  courses: DisambiguableCourse[],
): Map<number, string> {
  const baseLabelById = new Map(
    courses.map((course) => [course.id, formatInstructorCourseTitle(course)]),
  );

  const withTermById = new Map<number, string>();
  const countByLabel = new Map<string, number>();
  for (const course of courses) {
    const base = baseLabelById.get(course.id)!;
    countByLabel.set(base, (countByLabel.get(base) ?? 0) + 1);
  }
  for (const course of courses) {
    const base = baseLabelById.get(course.id)!;
    const collides = (countByLabel.get(base) ?? 0) > 1;
    withTermById.set(
      course.id,
      collides && course.term ? `${base} (${course.term})` : base,
    );
  }

  const countByTermLabel = new Map<string, number>();
  for (const course of courses) {
    const label = withTermById.get(course.id)!;
    countByTermLabel.set(label, (countByTermLabel.get(label) ?? 0) + 1);
  }

  const result = new Map<number, string>();
  const ordinalByLabel = new Map<string, number>();
  for (const course of courses) {
    const label = withTermById.get(course.id)!;
    if ((countByTermLabel.get(label) ?? 0) <= 1) {
      result.set(course.id, label);
      continue;
    }
    const ordinal = (ordinalByLabel.get(label) ?? 0) + 1;
    ordinalByLabel.set(label, ordinal);
    result.set(course.id, `${label} (${ordinal})`);
  }

  return result;
}
