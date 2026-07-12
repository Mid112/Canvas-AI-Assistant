import { describe, expect, it } from "vitest";

import {
  filterAnalyticsStudents,
  hasContactIdentity,
  isActiveEnrolledStudent,
  isPendingStudent,
  toStudentEmailRecipients,
} from "@/lib/student-analytics";
import type { CourseStudent } from "@/types/student";

function makeStudent(overrides: Partial<CourseStudent>): CourseStudent {
  return {
    id: 1,
    canvas_user_id: "1",
    course_id: 10,
    name: "Student One",
    sortable_name: "One, Student",
    login_id: "one@example.edu",
    enrollment_state: "active",
    ...overrides,
  };
}

describe("enrollment state predicates", () => {
  it("identifies active enrolled students case-insensitively", () => {
    expect(isActiveEnrolledStudent(makeStudent({ enrollment_state: "active" }))).toBe(
      true,
    );
    expect(isActiveEnrolledStudent(makeStudent({ enrollment_state: "Active" }))).toBe(
      true,
    );
    expect(
      isActiveEnrolledStudent(makeStudent({ enrollment_state: "invited" })),
    ).toBe(false);
  });

  it("identifies pending/invited students", () => {
    expect(isPendingStudent(makeStudent({ enrollment_state: "invited" }))).toBe(true);
    expect(
      isPendingStudent(makeStudent({ enrollment_state: "creation_pending" })),
    ).toBe(true);
    expect(isPendingStudent(makeStudent({ enrollment_state: "active" }))).toBe(false);
  });

  it("detects a usable contact identity", () => {
    expect(hasContactIdentity(makeStudent({ login_id: "a@b.edu" }))).toBe(true);
    expect(hasContactIdentity(makeStudent({ login_id: null }))).toBe(false);
    expect(hasContactIdentity(makeStudent({ login_id: "   " }))).toBe(false);
  });
});

describe("filterAnalyticsStudents", () => {
  it("excludes pending students without a contact identity but keeps everyone else", () => {
    const students = [
      makeStudent({ id: 1, canvas_user_id: "1", enrollment_state: "active" }),
      makeStudent({
        id: 2,
        canvas_user_id: "2",
        enrollment_state: "invited",
        login_id: null,
      }),
      makeStudent({
        id: 3,
        canvas_user_id: "3",
        enrollment_state: "invited",
        login_id: "invited@example.edu",
      }),
    ];

    const result = filterAnalyticsStudents(students);

    expect(result.map((student) => student.canvas_user_id)).toEqual(["1", "3"]);
  });
});

describe("toStudentEmailRecipients", () => {
  it("maps only students with an email, excluding pending/identity-less ones", () => {
    const students = [
      makeStudent({
        id: 1,
        canvas_user_id: "1",
        name: "Active One",
        login_id: "one@example.edu",
      }),
      makeStudent({
        id: 2,
        canvas_user_id: "2",
        name: "Invited No Email",
        enrollment_state: "invited",
        login_id: null,
      }),
      makeStudent({
        id: 3,
        canvas_user_id: "3",
        name: "Active No Email",
        login_id: "",
      }),
    ];

    const recipients = toStudentEmailRecipients(students);

    expect(recipients).toEqual([
      { id: "1", name: "Active One", email: "one@example.edu" },
    ]);
  });
});
