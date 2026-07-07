import { describe, expect, it } from "vitest";

import { formatInstructorCourseTitle } from "@/lib/format-course-title";

describe("formatInstructorCourseTitle", () => {
  it("returns only the code when code and name match", () => {
    expect(
      formatInstructorCourseTitle({ code: "COSC 101", name: "COSC 101" }),
    ).toBe("COSC 101");
  });

  it("returns code and name when they differ", () => {
    expect(
      formatInstructorCourseTitle({
        code: "CS 101",
        name: "Introduction to Programming",
      }),
    ).toBe("CS 101: Introduction to Programming");
  });

  it("returns the full name when it already includes the code", () => {
    expect(
      formatInstructorCourseTitle({
        code: "COSC 101",
        name: "COSC 101: Introduction to Programming",
      }),
    ).toBe("COSC 101: Introduction to Programming");
  });
});
