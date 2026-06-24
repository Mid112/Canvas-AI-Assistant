import { describe, expect, it } from "vitest";

import {
  getInstitutionSubmissionsData,
  institutionSubmissionsData,
} from "@/data/institutionSubmissionsData";

describe("institutionSubmissionsData", () => {
  it("provides submission analysis data for each institution", () => {
    expect(institutionSubmissionsData).toHaveLength(2);
    expect(getInstitutionSubmissionsData("ubc")?.assignments).toHaveLength(3);
    expect(getInstitutionSubmissionsData("ubco")?.assignments).toHaveLength(2);
  });

  it("includes missing and late students for each assignment", () => {
    const assignment = getInstitutionSubmissionsData("ubc")?.assignments[0];

    expect(assignment?.missingSubmissions.length).toBeGreaterThan(0);
    expect(assignment?.lateSubmissions.length).toBeGreaterThan(0);
    expect(assignment?.aiSummary.keyInsights).toContain("submission rate");
  });
});
