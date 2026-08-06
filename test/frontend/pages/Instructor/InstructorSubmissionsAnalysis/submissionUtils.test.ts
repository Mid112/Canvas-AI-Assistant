// Test note: covers the submission utils.test behavior so future changes can preserve the expected Canvas workflow contract.

import { describe, expect, it } from "vitest";

import { institutionSubmissionsData } from "@/data/institutionSubmissionsData";
import {
  filterSubmissionAssignments,
  filterSubmissionStudents,
  shouldShowLateSection,
  shouldShowMissingSection,
} from "@/pages/Instructor/InstructorSubmissionsAnalysis/submissionUtils";

const students = institutionSubmissionsData[0]!.assignments[0]!.missingSubmissions;

describe("filterSubmissionAssignments", () => {
  // Verifies: Filters assignments by label.
  it("filters assignments by label", () => {
    const assignments = institutionSubmissionsData[0]!.assignments;
    const results = filterSubmissionAssignments(assignments, "recursion");

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("hw4");
  });
});

describe("filterSubmissionStudents", () => {
  // Verifies: Returns all students when search is empty.
  it("returns all students when search is empty", () => {
    expect(filterSubmissionStudents(students, "")).toHaveLength(students.length);
  });

  // Verifies: Filters students by name or email.
  it("filters students by name or email", () => {
    const results = filterSubmissionStudents(students, "maria");

    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Maria Garcia");
  });
});

describe("shouldShowMissingSection", () => {
  // Verifies: Shows the missing section for all and missing filters.
  it("shows the missing section for all and missing filters", () => {
    expect(shouldShowMissingSection("all")).toBe(true);
    expect(shouldShowMissingSection("missing")).toBe(true);
    expect(shouldShowMissingSection("late")).toBe(false);
  });
});

describe("shouldShowLateSection", () => {
  // Verifies: Shows the late section for all and late filters.
  it("shows the late section for all and late filters", () => {
    expect(shouldShowLateSection("all")).toBe(true);
    expect(shouldShowLateSection("late")).toBe(true);
    expect(shouldShowLateSection("missing")).toBe(false);
  });
});
