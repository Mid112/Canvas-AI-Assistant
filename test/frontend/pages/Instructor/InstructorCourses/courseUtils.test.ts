import { describe, expect, it } from "vitest";

import { institutionCourseData } from "@/pages/Instructor/InstructorCourses/institutionCourseData";
import {
  filterInstructorCourses,
  sortInstructorCourses,
} from "@/pages/Instructor/InstructorCourses/courseUtils";

const ubcCourses = institutionCourseData[0]!.courses;

describe("filterInstructorCourses", () => {
  it("returns all courses when search is empty", () => {
    expect(filterInstructorCourses(ubcCourses, "")).toHaveLength(ubcCourses.length);
  });

  it("filters courses by code or name", () => {
    const results = filterInstructorCourses(ubcCourses, "database");

    expect(results).toHaveLength(1);
    expect(results[0]?.code).toBe("CS 250");
  });
});

describe("sortInstructorCourses", () => {
  it("sorts courses alphabetically by code and name", () => {
    const sorted = sortInstructorCourses(ubcCourses);

    expect(sorted[0]?.code).toBe("CS 101");
    expect(sorted.at(-1)?.code).toBe("CS 401");
  });
});
