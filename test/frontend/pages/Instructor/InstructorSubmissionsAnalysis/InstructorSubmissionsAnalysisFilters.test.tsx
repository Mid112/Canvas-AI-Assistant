import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { institutionSubmissionsData } from "@/data/institutionSubmissionsData";
import { InstructorSubmissionsAnalysisFilters } from "@/pages/Instructor/InstructorSubmissionsAnalysis/InstructorSubmissionsAnalysisFilters";
import { getCourseAssignments } from "@/pages/Instructor/InstructorSubmissionsAnalysis/submissionNavigation";

const assignments = getCourseAssignments(
  institutionSubmissionsData[0]!.assignments,
  { id: 1, code: "CS 101" },
);

describe("InstructorSubmissionsAnalysisFilters", () => {
  // Verifies: Calls change handlers when filters are updated.
  it("calls change handlers when filters are updated", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    const onStatusFilterChange = vi.fn();

    render(
      <InstructorSubmissionsAnalysisFilters
        assignments={assignments}
        selectedAssignmentId="pa3"
        onAssignmentChange={vi.fn()}
        search=""
        onSearchChange={onSearchChange}
        statusFilter="all"
        onStatusFilterChange={onStatusFilterChange}
      />,
    );

    await user.type(screen.getByLabelText("Search students"), "maria");
    await user.selectOptions(
      screen.getByLabelText("Filter by Status"),
      "missing",
    );

    expect(onSearchChange).toHaveBeenCalled();
    expect(onStatusFilterChange).toHaveBeenCalledWith("missing");
  });
});
