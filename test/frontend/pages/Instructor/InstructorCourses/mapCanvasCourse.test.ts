import { describe, expect, it } from "vitest";

import { mapCanvasCourseToInstructorCourse } from "@/pages/Instructor/InstructorCourses/mapCanvasCourse";
import type { CanvasCourse } from "@/types/canvas";

const CANVAS_URL = "https://canvas.ubc.ca";

function canvasCourse(overrides: Partial<CanvasCourse> = {}): CanvasCourse {
  return {
    canvas_id: 1,
    local_id: 10,
    name: "CS 101",
    course_code: "CS101",
    workflow_state: "available",
    total_students: 20,
    term_name: "Fall 2026",
    ...overrides,
  };
}

describe("mapCanvasCourseToInstructorCourse", () => {
  // Verifies: Returns null when there is no synced local row.
  it("returns null when the course has no local_id", () => {
    const result = mapCanvasCourseToInstructorCourse(
      canvasCourse({ local_id: null }),
      CANVAS_URL,
    );
    expect(result).toBeNull();
  });

  it.each([
    ["available", true],
    ["unpublished", false],
    ["completed", true],
    ["deleted", false],
  ])("maps workflow_state %s to isPublished %s", (workflow_state, expected) => {
    const result = mapCanvasCourseToInstructorCourse(
      canvasCourse({ workflow_state }),
      CANVAS_URL,
    );
    expect(result?.isPublished).toBe(expected);
  });

  // Verifies: A completed course is selectable (isPublished) but read-only
  // (isWritable is false) — distinct from a truly unpublished/deleted course,
  // which is neither.
  it.each([
    ["available", true],
    ["unpublished", false],
    ["completed", false],
    ["deleted", false],
  ])("maps workflow_state %s to isWritable %s", (workflow_state, expected) => {
    const result = mapCanvasCourseToInstructorCourse(
      canvasCourse({ workflow_state }),
      CANVAS_URL,
    );
    expect(result?.isWritable).toBe(expected);
  });
});
