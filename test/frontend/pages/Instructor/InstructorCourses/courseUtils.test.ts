import { describe, expect, it } from "vitest";

import { institutionCourseData } from "@/data/institutionCourseData";
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

  it("defaults to showing all courses regardless of publish status", () => {
    const courses = [
      { ...ubcCourses[0]!, isPublished: true },
      { ...ubcCourses[1]!, isPublished: false },
    ];

    expect(filterInstructorCourses(courses, "")).toHaveLength(2);
  });

  it("filters to published courses only", () => {
    const courses = [
      { ...ubcCourses[0]!, isPublished: true },
      { ...ubcCourses[1]!, isPublished: false },
    ];

    const results = filterInstructorCourses(courses, "", "published");

    expect(results).toHaveLength(1);
    expect(results[0]?.isPublished).toBe(true);
  });

  it("filters to unpublished courses only", () => {
    const courses = [
      { ...ubcCourses[0]!, isPublished: true },
      { ...ubcCourses[1]!, isPublished: false },
    ];

    const results = filterInstructorCourses(courses, "", "unpublished");

    expect(results).toHaveLength(1);
    expect(results[0]?.isPublished).toBe(false);
  });

  it("combines the search query with the publish-status filter", () => {
    const courses = [
      { ...ubcCourses[0]!, code: "CS 250", name: "Databases", isPublished: true },
      { ...ubcCourses[1]!, code: "CS 251", name: "Databases II", isPublished: false },
    ];

    const results = filterInstructorCourses(courses, "database", "published");

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
