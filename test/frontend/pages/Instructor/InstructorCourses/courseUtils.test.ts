import { describe, expect, it } from "vitest";

import { institutionCourseData } from "@/data/institutionCourseData";
import {
  coursePublishLabel,
  filterInstructorCourses,
  sortInstructorCourses,
} from "@/pages/Instructor/InstructorCourses/courseUtils";
import type { InstructorCourse } from "@/types/course";

const ubcCourses = institutionCourseData[0]!.courses;

const mixedCourses: InstructorCourse[] = [
  {
    id: 1,
    code: "CS 200",
    name: "Published Course",
    progress: 10,
    studentCount: 1,
    assignmentCount: 1,
    lastActivity: "Synced",
    workflowState: "available",
  },
  {
    id: 2,
    code: "CS 100",
    name: "Draft Course",
    progress: 0,
    studentCount: 0,
    assignmentCount: 0,
    lastActivity: "Synced",
    workflowState: "unpublished",
  },
  {
    id: 3,
    code: "CS 300",
    name: "Past Course",
    progress: 100,
    studentCount: 2,
    assignmentCount: 2,
    lastActivity: "Synced",
    workflowState: "completed",
  },
];

describe("filterInstructorCourses", () => {
  it("returns all courses when search is empty", () => {
    expect(filterInstructorCourses(ubcCourses, "")).toHaveLength(ubcCourses.length);
  });

  it("filters courses by code or name", () => {
    const results = filterInstructorCourses(ubcCourses, "database");

    expect(results).toHaveLength(1);
    expect(results[0]?.code).toBe("CS 250");
  });

  it("filters by publish status", () => {
    expect(filterInstructorCourses(mixedCourses, "", "published")).toEqual([
      mixedCourses[0],
    ]);
    expect(filterInstructorCourses(mixedCourses, "", "unpublished")).toEqual([
      mixedCourses[1],
    ]);
  });
});

describe("sortInstructorCourses", () => {
  it("sorts published before unpublished before completed", () => {
    const sorted = sortInstructorCourses(mixedCourses);

    expect(sorted.map((course) => course.workflowState)).toEqual([
      "available",
      "unpublished",
      "completed",
    ]);
  });
});

describe("coursePublishLabel", () => {
  it("labels Canvas workflow states for the UI", () => {
    expect(coursePublishLabel(mixedCourses[0]!)).toBe("Published");
    expect(coursePublishLabel(mixedCourses[1]!)).toBe("Unpublished");
    expect(coursePublishLabel(mixedCourses[2]!)).toBe("Completed");
  });
});
