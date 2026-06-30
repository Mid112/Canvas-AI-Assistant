import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { institutionSubmissionsData } from "@/data/institutionSubmissionsData";
import { LateSubmissionsSection } from "@/pages/Instructor/InstructorSubmissionsAnalysis/LateSubmissionsSection";

const students = institutionSubmissionsData[0]!.assignments[0]!.lateSubmissions;

describe("LateSubmissionsSection", () => {
  it("renders the late submissions table", () => {
    render(<LateSubmissionsSection students={students} />);

    expect(
      screen.getByRole("heading", { name: "Late Submissions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("3 students submitted late"),
    ).toBeInTheDocument();
    expect(screen.getByText("Emma Davis")).toBeInTheDocument();
    expect(screen.getByText("emma.davis@student.ubc.ca")).toBeInTheDocument();
    expect(screen.getByText("2 days late")).toHaveClass("text-amber-600");
  });

  it("uses singular copy for one late submission", () => {
    render(<LateSubmissionsSection students={[students[0]!]} />);

    expect(screen.getByText("1 student submitted late")).toBeInTheDocument();
  });

  it("renders an empty state when there are no students", () => {
    render(<LateSubmissionsSection students={[]} />);

    expect(
      screen.getByText("No late submissions match your filters."),
    ).toBeInTheDocument();
  });
});
