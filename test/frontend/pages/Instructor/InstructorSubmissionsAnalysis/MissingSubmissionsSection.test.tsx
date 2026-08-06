import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { institutionSubmissionsData } from "@/data/institutionSubmissionsData";
import { MissingSubmissionsSection } from "@/pages/Instructor/InstructorSubmissionsAnalysis/MissingSubmissionsSection";

const students = institutionSubmissionsData[0]!.assignments[0]!.missingSubmissions;

describe("MissingSubmissionsSection", () => {
  // Verifies: Uses singular copy for one missing submission.
  it("uses singular copy for one missing submission", () => {
    render(<MissingSubmissionsSection students={[students[0]!]} />);

    expect(screen.getByText("1 student has not submitted")).toBeInTheDocument();
  });

  // Verifies: Renders an empty state when there are no students.
  it("renders an empty state when there are no students", () => {
    render(<MissingSubmissionsSection students={[]} />);

    expect(
      screen.getByText("No missing submissions match your filters."),
    ).toBeInTheDocument();
  });
});
