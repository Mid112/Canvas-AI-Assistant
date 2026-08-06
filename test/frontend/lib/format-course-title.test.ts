// Test note: covers the format course title.test behavior so future changes can preserve the expected Canvas workflow contract.

import { describe, expect, it } from "vitest";

import { formatInstructorCourseTitle } from "@/lib/format-course-title";

describe("formatInstructorCourseTitle", () => {
  // Verifies: Returns the course name when the code is empty.
  it("returns the course name when the code is empty", () => {
    expect(
      formatInstructorCourseTitle({
        code: "",
        name: "Introduction to Programming",
      }),
    ).toBe("Introduction to Programming");
  });

  // Verifies: Returns only the code when code and name match.
  it("returns only the code when code and name match", () => {
    expect(
      formatInstructorCourseTitle({ code: "COSC 101", name: "COSC 101" }),
    ).toBe("COSC 101");
  });

  // Verifies: Returns code and name when they differ.
  it("returns code and name when they differ", () => {
    expect(
      formatInstructorCourseTitle({
        code: "CS 101",
        name: "Introduction to Programming",
      }),
    ).toBe("CS 101: Introduction to Programming");
  });

  // Verifies: Returns the full name when it already includes the code.
  it("returns the full name when it already includes the code", () => {
    expect(
      formatInstructorCourseTitle({
        code: "COSC 101",
        name: "COSC 101: Introduction to Programming",
      }),
    ).toBe("COSC 101: Introduction to Programming");
  });
});
