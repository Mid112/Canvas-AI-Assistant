import { describe, expect, it } from "vitest";

import { institutionSubmissionsData } from "@/data/institutionSubmissionsData";
import { instructorCourseAnalyticsPath } from "@/routes/paths";
import {
  getCourseAnalyticsPath,
  getCourseAssignments,
  parseSubmissionStatusFilter,
  resolveEffectiveAssignmentId,
  resolveEffectiveCanvasAssignmentId,
} from "@/pages/Instructor/InstructorSubmissionsAnalysis/submissionNavigation";
import type { AssignmentSubmissionAnalysis } from "@/types/submission";

describe("getCourseAnalyticsPath", () => {
  // Verifies: Builds course analytics paths with optional filters.
  it("builds course analytics paths with optional filters", () => {
    expect(getCourseAnalyticsPath(1)).toBe(instructorCourseAnalyticsPath(1));
    expect(getCourseAnalyticsPath(2, { status: "missing" })).toBe(
      `${instructorCourseAnalyticsPath(2)}?status=missing`,
    );
    expect(
      getCourseAnalyticsPath(1, {
        assignmentId: "pa3",
        status: "late",
      }),
    ).toBe(`${instructorCourseAnalyticsPath(1)}?assignmentId=pa3&status=late`);
  });
});

describe("getCourseAssignments", () => {
  // Verifies: Returns assignments for the requested course only.
  it("returns assignments for the requested course only", () => {
    const assignments = institutionSubmissionsData[0]!.assignments;

    expect(getCourseAssignments(assignments, { id: 1, code: "CS 101" })).toHaveLength(1);
    expect(getCourseAssignments(assignments, { id: 1, code: "CS 101" })[0]?.id).toBe(
      "pa3",
    );
    expect(getCourseAssignments(assignments, { id: 2, code: "CS 201" })[0]?.id).toBe(
      "hw4",
    );
  });

  // Verifies: Matches mock assignments by course code when canvas ids differ.
  it("matches mock assignments by course code when canvas ids differ", () => {
    const assignments = institutionSubmissionsData[0]!.assignments;

    expect(
      getCourseAssignments(assignments, { id: 42, code: "cs 101" }),
    ).toEqual(getCourseAssignments(assignments, { id: 1, code: "CS 101" }));
  });
});

describe("parseSubmissionStatusFilter", () => {
  // Verifies: Parses supported status values and defaults to all.
  it("parses supported status values and defaults to all", () => {
    expect(parseSubmissionStatusFilter("missing")).toBe("missing");
    expect(parseSubmissionStatusFilter("late")).toBe("late");
    expect(parseSubmissionStatusFilter("all")).toBe("all");
    expect(parseSubmissionStatusFilter(null)).toBe("all");
  });
});

describe("resolveEffectiveAssignmentId", () => {
  const assignments = [
    { id: "pa3", courseId: 1 },
    { id: "hw4", courseId: 1 },
  ] as AssignmentSubmissionAnalysis[];

  // Verifies: Prefers the user selection over the URL param.
  it("prefers the user selection over the URL param", () => {
    expect(resolveEffectiveAssignmentId(assignments, "hw4", "pa3")).toBe("hw4");
  });

  // Verifies: Falls back to the URL param when the user has not selected.
  it("falls back to the URL param when the user has not selected", () => {
    expect(resolveEffectiveAssignmentId(assignments, "", "pa3")).toBe("pa3");
  });

  // Verifies: Falls back to the first assignment when neither source matches.
  it("falls back to the first assignment when neither source matches", () => {
    expect(resolveEffectiveAssignmentId(assignments, "", null)).toBe("pa3");
  });
});

describe("resolveEffectiveCanvasAssignmentId", () => {
  const canvasAssignments = [{ id: 10 }, { id: 20 }];

  // Verifies: Prefers explicit user selection.
  it("prefers explicit user selection", () => {
    expect(
      resolveEffectiveCanvasAssignmentId(canvasAssignments, "20", "10"),
    ).toBe("20");
  });

  // Verifies: Falls back to URL assignment id.
  it("falls back to URL assignment id", () => {
    expect(
      resolveEffectiveCanvasAssignmentId(canvasAssignments, "", "20"),
    ).toBe("20");
  });

  // Verifies: Defaults to the first Canvas assignment.
  it("defaults to the first Canvas assignment", () => {
    expect(
      resolveEffectiveCanvasAssignmentId(canvasAssignments, "", null),
    ).toBe("10");
  });
});
