// Test note: covers the active course context bar.test behavior so future changes can preserve the expected Canvas workflow contract.

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ActiveCourseContextBar } from "@/components/courses/ActiveCourseContextBar";

vi.mock("@/components/courses/ActiveCourseSelector", () => ({
  ActiveCourseSelector: () => <div>Active course selector</div>,
}));

const mockUseActiveCourse = vi.fn();

vi.mock("@/contexts/useActiveCourse", () => ({
  useActiveCourse: () => mockUseActiveCourse(),
}));

describe("ActiveCourseContextBar", () => {
  // Verifies: Shows guidance when no active course is selected.
  it("shows guidance when no active course is selected", () => {
    mockUseActiveCourse.mockReturnValue({
      activeCourse: null,
      error: null,
      isLoading: false,
    });

    render(<ActiveCourseContextBar />);

    expect(
      screen.getByText(/Select a course to scope assistant actions/),
    ).toBeInTheDocument();
    expect(screen.getByText("Active course selector")).toBeInTheDocument();
    expect(screen.getByText("Course")).toBeInTheDocument();
  });

  // Verifies: Does not duplicate the active course name — the selector's
  // own <select> already displays it as its selected option.
  it("does not show a redundant active course name when one is selected", () => {
    mockUseActiveCourse.mockReturnValue({
      activeCourse: {
        localId: 1,
        displayName: "CS 101: Introduction to Programming",
      },
      error: null,
      isLoading: false,
    });

    render(<ActiveCourseContextBar />);

    expect(
      screen.queryByText("CS 101: Introduction to Programming"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Active course selector")).toBeInTheDocument();
    expect(
      screen.queryByText(/Select a course to scope assistant actions/),
    ).not.toBeInTheDocument();
  });

  // Verifies: Does not show the empty-state message while still loading.
  it("does not show the empty-state message while the active course loads", () => {
    mockUseActiveCourse.mockReturnValue({
      activeCourse: null,
      error: null,
      isLoading: true,
    });

    render(<ActiveCourseContextBar />);

    expect(
      screen.queryByText(/Select a course to scope assistant actions/),
    ).not.toBeInTheDocument();
  });

  // Verifies: Shows an error alert when active course loading fails.
  it("shows an error alert when active course loading fails", () => {
    mockUseActiveCourse.mockReturnValue({
      activeCourse: null,
      error: "Unable to load active course.",
      isLoading: false,
    });

    render(<ActiveCourseContextBar />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to load active course.",
    );
  });
});
