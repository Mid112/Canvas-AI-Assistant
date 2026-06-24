import { describe, expect, it } from "vitest";

import { institutionSubmissionsData } from "@/data/institutionSubmissionsData";
import {
  filterSubmissionStudents,
  shouldShowLateSection,
  shouldShowMissingSection,
} from "@/pages/Instructor/InstructorSubmissionsAnalysis/submissionUtils";

const students = institutionSubmissionsData[0]!.assignments[0]!.missingSubmissions;

describe("filterSubmissionStudents", () => {
  it("returns all students when search is empty", () => {
    expect(filterSubmissionStudents(students, "")).toHaveLength(students.length);
  });

  it("filters students by name or email", () => {
    const results = filterSubmissionStudents(students, "maria");

    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Maria Garcia");
  });
});

describe("shouldShowMissingSection", () => {
  it("shows the missing section for all and missing filters", () => {
    expect(shouldShowMissingSection("all")).toBe(true);
    expect(shouldShowMissingSection("missing")).toBe(true);
    expect(shouldShowMissingSection("late")).toBe(false);
  });
});

describe("shouldShowLateSection", () => {
  it("shows the late section for all and late filters", () => {
    expect(shouldShowLateSection("all")).toBe(true);
    expect(shouldShowLateSection("late")).toBe(true);
    expect(shouldShowLateSection("missing")).toBe(false);
  });
});
