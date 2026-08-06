// Test note: covers the assignment search select.test behavior so future changes can preserve the expected Canvas workflow contract.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { institutionSubmissionsData } from "@/data/institutionSubmissionsData";
import { AssignmentSearchSelect } from "@/pages/Instructor/InstructorSubmissionsAnalysis/AssignmentSearchSelect";
import { getCourseAssignments } from "@/pages/Instructor/InstructorSubmissionsAnalysis/submissionNavigation";

const assignments = getCourseAssignments(
  institutionSubmissionsData[0]!.assignments,
  { id: 1, code: "CS 101" },
);

describe("AssignmentSearchSelect", () => {
  // Verifies: Renders a combined search and select control.
  it("renders a combined search and select control", () => {
    render(
      <AssignmentSearchSelect
        assignments={assignments}
        selectedAssignmentId="pa3"
        onAssignmentChange={vi.fn()}
      />,
    );

    expect(
      screen.getByLabelText("Search or select assignment"),
    ).toHaveValue("Programming Assignment 3");
  });

  // Verifies: Filters assignments and selects one from the dropdown.
  it("filters assignments and selects one from the dropdown", async () => {
    const user = userEvent.setup();
    const onAssignmentChange = vi.fn();
    const courseAssignments = getCourseAssignments(
      institutionSubmissionsData[0]!.assignments,
      { id: 2, code: "CS 201" },
    );

    render(
      <AssignmentSearchSelect
        assignments={courseAssignments}
        selectedAssignmentId="hw4"
        onAssignmentChange={onAssignmentChange}
      />,
    );

    const input = screen.getByLabelText("Search or select assignment");
    await user.clear(input);
    await user.type(input, "Recursion");

    expect(
      screen.getByRole("option", { name: "Homework 4: Recursion" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Homework 4: Recursion" }),
    );

    expect(onAssignmentChange).toHaveBeenCalledWith("hw4");
    expect(input).toHaveValue("Homework 4: Recursion");
  });

  // Verifies: Supports keyboard navigation to select an assignment.
  it("supports keyboard navigation to select an assignment", async () => {
    const user = userEvent.setup();
    const onAssignmentChange = vi.fn();
    const courseAssignments = getCourseAssignments(
      institutionSubmissionsData[0]!.assignments,
      { id: 2, code: "CS 201" },
    );

    render(
      <AssignmentSearchSelect
        assignments={courseAssignments}
        selectedAssignmentId="hw4"
        onAssignmentChange={onAssignmentChange}
      />,
    );

    const input = screen.getByLabelText("Search or select assignment");
    await user.click(input);
    await user.keyboard("{ArrowDown}{Enter}");

    expect(onAssignmentChange).toHaveBeenCalledWith("hw4");
  });
});
