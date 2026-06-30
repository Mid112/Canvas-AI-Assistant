import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { institutionSubmissionsData } from "@/data/institutionSubmissionsData";
import { MissingSubmissionsSection } from "@/pages/Instructor/InstructorSubmissionsAnalysis/MissingSubmissionsSection";

const students = institutionSubmissionsData[0]!.assignments[0]!.missingSubmissions;

describe("MissingSubmissionsSection", () => {
  it("renders the missing submissions table", () => {
    render(<MissingSubmissionsSection students={students} />);

    expect(
      screen.getByRole("heading", { name: "Missing Submissions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("5 students have not submitted"),
    ).toBeInTheDocument();
    expect(screen.getByText("Alex Thompson")).toBeInTheDocument();
    expect(screen.getByText("maria.garcia@student.ubc.ca")).toBeInTheDocument();
    expect(screen.getByText("1 week ago")).toBeInTheDocument();
  });

  it("uses singular copy for one missing submission", () => {
    render(<MissingSubmissionsSection students={[students[0]!]} />);

    expect(screen.getByText("1 student has not submitted")).toBeInTheDocument();
  });

  it("renders an empty state when there are no students", () => {
    render(<MissingSubmissionsSection students={[]} />);

    expect(
      screen.getByText("No missing submissions match your filters."),
    ).toBeInTheDocument();
  });
});
