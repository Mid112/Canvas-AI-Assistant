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
      screen.getByText(/No active course selected/),
    ).toBeInTheDocument();
    expect(screen.getByText("Active course selector")).toBeInTheDocument();
  });

  // Verifies: Does not duplicate the active course name — the selector shows it.
  it("does not duplicate the active course name while one is selected", () => {
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
