import { describe, expect, it } from "vitest";

import { paths } from "@/routes/paths";
import {
  getSubmissionsAnalysisPath,
  parseSubmissionStatusFilter,
} from "@/pages/Instructor/InstructorSubmissionsAnalysis/submissionNavigation";

describe("getSubmissionsAnalysisPath", () => {
  it("builds analytics paths with optional filters", () => {
    expect(getSubmissionsAnalysisPath()).toBe(paths.instructor.analytics);
    expect(getSubmissionsAnalysisPath({ status: "missing" })).toBe(
      `${paths.instructor.analytics}?status=missing`,
    );
    expect(
      getSubmissionsAnalysisPath({
        assignmentId: "pa3",
        status: "late",
      }),
    ).toBe(`${paths.instructor.analytics}?assignmentId=pa3&status=late`);
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
