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
  // Verifies: Shows the active course display name when one is selected.
  it("shows the active course display name when one is selected", () => {
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
      screen.getByText("CS 101: Introduction to Programming"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Conversations are scoped to this course/),
    ).toBeInTheDocument();
  });

  // Verifies: Shows a loading message while the active course loads.
  it("shows a loading message while the active course loads", () => {
    mockUseActiveCourse.mockReturnValue({
      activeCourse: null,
      error: null,
      isLoading: true,
    });

    render(<ActiveCourseContextBar />);

    expect(screen.getByText("Loading active course...")).toBeInTheDocument();
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
