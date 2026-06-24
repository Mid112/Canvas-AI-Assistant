import { describe, expect, it } from "vitest";

import { institutionSubmissionsData } from "@/data/institutionSubmissionsData";
import { buildSubmissionsExportCsv } from "@/pages/Instructor/InstructorSubmissionsAnalysis/submissionExport";

const assignment = institutionSubmissionsData[0]!.assignments[0]!;

describe("buildSubmissionsExportCsv", () => {
  it("builds a csv report for missing and late students", () => {
    const csv = buildSubmissionsExportCsv(
      assignment,
      assignment.missingSubmissions.slice(0, 1),
      assignment.lateSubmissions.slice(0, 1),
    );

    expect(csv).toContain("CS 101: Programming Assignment 3");
    expect(csv).toContain("status,name,email,last_active,late_by");
    expect(csv).toContain("missing,Alex Thompson,alex.thompson@student.ubc.ca");
    expect(csv).toContain("late,Emma Davis,emma.davis@student.ubc.ca");
  });
});
