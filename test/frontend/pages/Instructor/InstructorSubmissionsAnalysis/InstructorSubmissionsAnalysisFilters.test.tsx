import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { institutionSubmissionsData } from "@/data/institutionSubmissionsData";
import { InstructorSubmissionsAnalysisFilters } from "@/pages/Instructor/InstructorSubmissionsAnalysis/InstructorSubmissionsAnalysisFilters";

const assignments = institutionSubmissionsData[0]!.assignments;

describe("InstructorSubmissionsAnalysisFilters", () => {
  it("renders assignment, search, and status controls", () => {
    render(
      <InstructorSubmissionsAnalysisFilters
        assignments={assignments}
        selectedAssignmentId="pa3"
        onAssignmentChange={vi.fn()}
        search=""
        onSearchChange={vi.fn()}
        statusFilter="all"
        onStatusFilterChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Select Assignment")).toBeInTheDocument();
    expect(screen.getByLabelText("Search students")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by Status")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "CS 101: Programming Assignment 3" }),
    ).toBeInTheDocument();
  });

  it("calls change handlers when filters are updated", async () => {
    const user = userEvent.setup();
    const onAssignmentChange = vi.fn();
    const onSearchChange = vi.fn();
    const onStatusFilterChange = vi.fn();

    render(
      <InstructorSubmissionsAnalysisFilters
        assignments={assignments}
        selectedAssignmentId="pa3"
        onAssignmentChange={onAssignmentChange}
        search=""
        onSearchChange={onSearchChange}
        statusFilter="all"
        onStatusFilterChange={onStatusFilterChange}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Select Assignment"), "hw4");
    await user.type(screen.getByLabelText("Search students"), "maria");
    await user.selectOptions(
      screen.getByLabelText("Filter by Status"),
      "missing",
    );

    expect(onAssignmentChange).toHaveBeenCalledWith("hw4");
    expect(onSearchChange).toHaveBeenCalled();
    expect(onStatusFilterChange).toHaveBeenCalledWith("missing");
  });
});
