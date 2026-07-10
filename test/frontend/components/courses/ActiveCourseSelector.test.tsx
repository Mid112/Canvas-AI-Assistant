import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActiveCourseSelector } from "@/components/courses/ActiveCourseSelector";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const mockSelectActiveCourse = vi.fn();
const mockUseActiveCourse = vi.fn();

vi.mock("@/contexts/useActiveCourse", () => ({
  useActiveCourse: () => mockUseActiveCourse(),
}));

describe("ActiveCourseSelector", () => {
  beforeEach(() => {
    mockSelectActiveCourse.mockReset();
    mockUseActiveCourse.mockReturnValue({
      activeCourse: {
        localId: 10,
        canvasCourseId: 42,
        displayName: "COSC 499: Capstone",
      },
      availableCourses: [
        {
          id: 10,
          name: "Capstone",
          code: "COSC 499",
          term: "2026S",
          studentCount: 20,
          assignmentCount: 4,
        },
        {
          id: 11,
          name: "Algorithms",
          code: "COSC 320",
          term: "2026S",
          studentCount: 40,
          assignmentCount: 6,
        },
      ],
      isLoading: false,
      isSaving: false,
      selectActiveCourse: mockSelectActiveCourse,
    });
  });

  // #689 — Add missing frontend tests
  // Verifies: Renders course options and the current selection.
  it("renders available courses with the active course selected", () => {
    renderWithRouter(<ActiveCourseSelector />);

    const select = screen.getByLabelText("Select active course");
    expect(select).toHaveValue("10");
    expect(screen.getByRole("option", { name: "COSC 499: Capstone" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "COSC 320: Algorithms" }),
    ).toBeInTheDocument();
  });

  // Verifies: Changing the select calls selectActiveCourse.
  it("calls selectActiveCourse when a different course is chosen", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ActiveCourseSelector />);

    await user.selectOptions(
      screen.getByLabelText("Select active course"),
      "11",
    );

    expect(mockSelectActiveCourse).toHaveBeenCalledWith(11);
  });

  // Verifies: Loading state disables the control.
  it("disables the selector while courses are loading", () => {
    mockUseActiveCourse.mockReturnValue({
      activeCourse: null,
      availableCourses: [],
      isLoading: true,
      isSaving: false,
      selectActiveCourse: mockSelectActiveCourse,
    });

    renderWithRouter(<ActiveCourseSelector />);

    expect(screen.getByLabelText("Select active course")).toBeDisabled();
    expect(
      screen.getByRole("option", { name: "Loading courses..." }),
    ).toBeInTheDocument();
  });
});
