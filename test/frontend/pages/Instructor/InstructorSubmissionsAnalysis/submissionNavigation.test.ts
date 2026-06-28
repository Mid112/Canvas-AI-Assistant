import { describe, expect, it } from "vitest";

import { institutionSubmissionsData } from "@/data/institutionSubmissionsData";
import { paths } from "@/routes/paths";
import {
  getCourseAnalyticsPath,
  getCourseAssignments,
  parseSubmissionStatusFilter,
} from "@/pages/Instructor/InstructorSubmissionsAnalysis/submissionNavigation";

describe("getCourseAnalyticsPath", () => {
  it("builds course analytics paths with optional filters", () => {
    expect(getCourseAnalyticsPath(1)).toBe(paths.instructor.courseAnalytics(1));
    expect(getCourseAnalyticsPath(2, { status: "missing" })).toBe(
      `${paths.instructor.courseAnalytics(2)}?status=missing`,
    );
    expect(
      getCourseAnalyticsPath(1, {
        assignmentId: "pa3",
        status: "late",
      }),
    ).toBe(`${paths.instructor.courseAnalytics(1)}?assignmentId=pa3&status=late`);
  });
});

describe("getCourseAssignments", () => {
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

  it("matches mock assignments by course code when canvas ids differ", () => {
    const assignments = institutionSubmissionsData[0]!.assignments;

    expect(
      getCourseAssignments(assignments, { id: 42, code: "cs 101" }),
    ).toEqual(getCourseAssignments(assignments, { id: 1, code: "CS 101" }));
  });
});

describe("parseSubmissionStatusFilter", () => {
  it("parses supported status values and defaults to all", () => {
    expect(parseSubmissionStatusFilter("missing")).toBe("missing");
    expect(parseSubmissionStatusFilter("late")).toBe("late");
    expect(parseSubmissionStatusFilter("all")).toBe("all");
    expect(parseSubmissionStatusFilter(null)).toBe("all");
  });
});
