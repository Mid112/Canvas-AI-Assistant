import type { CourseStudent } from "@/types/student";

/**
 * Shared rules for how students are counted and listed across analytics
 * surfaces (course roster, messaging recipients, submission analytics).
 *
 * The consistent rule: count and list the same set of students everywhere.
 * Canvas exposes "invited"/"creation_pending" enrollments that often lack a
 * reliable email/login identity — including them makes the total count exceed
 * the usable roster and leaves blank rows in the email section. To keep every
 * surface consistent we exclude pending enrollments that have no contact
 * identity, and clearly label the enrollment state for the rest.
 */

const ACTIVE_ENROLLMENT_STATE = "active";

const PENDING_ENROLLMENT_STATES = new Set([
  "invited",
  "creation_pending",
  "pending",
]);

function normalizeEnrollmentState(state: string | null | undefined): string {
  return (state ?? "").trim().toLowerCase();
}

export function isActiveEnrolledStudent(student: CourseStudent): boolean {
  return normalizeEnrollmentState(student.enrollment_state) === ACTIVE_ENROLLMENT_STATE;
}

export function isPendingStudent(student: CourseStudent): boolean {
  return PENDING_ENROLLMENT_STATES.has(
    normalizeEnrollmentState(student.enrollment_state),
  );
}

/** True when a student has a usable email/login identifier. */
export function hasContactIdentity(student: CourseStudent): boolean {
  return Boolean(student.login_id && student.login_id.trim());
}

/**
 * Filters a roster to the students that should appear in analytics lists and
 * counts. Pending/invited enrollments without a contact identity are dropped
 * so the visible list, its count, and the email section stay consistent.
 */
export function filterAnalyticsStudents(
  students: CourseStudent[],
): CourseStudent[] {
  return students.filter(
    (student) => !(isPendingStudent(student) && !hasContactIdentity(student)),
  );
}

export interface StudentEmailRecipient {
  id: string;
  name: string;
  email: string;
}

/**
 * Builds the messaging recipient list. Canvas conversations are addressed by
 * the student's Canvas user id, not by email, so every analytics student is a
 * valid recipient — including active students that Canvas returns without a
 * login/email. The email is included when available (for display) but is not
 * required to message a student.
 */
export function toStudentEmailRecipients(
  students: CourseStudent[],
): StudentEmailRecipient[] {
  return filterAnalyticsStudents(students).map((student) => ({
    id: student.canvas_user_id,
    name: student.name,
    email: student.login_id ?? "",
  }));
}
