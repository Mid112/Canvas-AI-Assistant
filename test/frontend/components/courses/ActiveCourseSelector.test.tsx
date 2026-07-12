import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ActiveCourseSelector } from "@/components/courses/ActiveCourseSelector";
import type { InstructorCourse } from "@/types/course";

const mockUseActiveCourse = vi.fn();

vi.mock("@/contexts/useActiveCourse", () => ({
  useActiveCourse: () => mockUseActiveCourse(),
}));

function makeCourse(overrides: Partial<InstructorCourse>): InstructorCourse {
  return {
    id: 1,
    code: "COSC 310",
    name: "COSC 310",
    progress: 0,
    studentCount: 0,
    assignmentCount: 0,
    lastActivity: "",
    isPublished: true,
    isWritable: true,
    term: null,
    ...overrides,
  };
}

describe("ActiveCourseSelector", () => {
  it("only lists published courses, using the shared course title format (not a raw code: name duplicate)", () => {
    mockUseActiveCourse.mockReturnValue({
      activeCourse: null,
      availableCourses: [
        makeCourse({ id: 1, code: "COSC 310", name: "COSC 310", isPublished: true }),
        makeCourse({ id: 2, code: "COSC 499", name: "COSC 499", isPublished: false }),
      ],
      isLoading: false,
      isSaving: false,
      selectActiveCourse: vi.fn(),
    });

    render(<ActiveCourseSelector />);

    expect(screen.getByRole("option", { name: "COSC 310" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /COSC 499/ }),
    ).not.toBeInTheDocument();
  });

  it("shows a distinct empty state when courses exist but none are published", () => {
    mockUseActiveCourse.mockReturnValue({
      activeCourse: null,
      availableCourses: [
        makeCourse({ id: 1, code: "COSC 499", name: "COSC 499", isPublished: false }),
      ],
      isLoading: false,
      isSaving: false,
      selectActiveCourse: vi.fn(),
    });

    render(<ActiveCourseSelector />);

    expect(
      screen.getByRole("option", { name: "No published courses available" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Select active course")).toBeDisabled();
  });

  it("disambiguates two published courses that share the same code and name", () => {
    mockUseActiveCourse.mockReturnValue({
      activeCourse: null,
      availableCourses: [
        makeCourse({ id: 1, code: "COSC 499", name: "COSC 499", term: "Fall 2026" }),
        makeCourse({ id: 2, code: "COSC 499", name: "COSC 499", term: "Winter 2026" }),
      ],
      isLoading: false,
      isSaving: false,
      selectActiveCourse: vi.fn(),
    });

    render(<ActiveCourseSelector />);

    expect(
      screen.getByRole("option", { name: "COSC 499 (Fall 2026)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "COSC 499 (Winter 2026)" }),
    ).toBeInTheDocument();
  });

  it("calls selectActiveCourse when a course is chosen", async () => {
    const selectActiveCourse = vi.fn();
    const user = userEvent.setup();
    mockUseActiveCourse.mockReturnValue({
      activeCourse: null,
      availableCourses: [makeCourse({ id: 7, code: "COSC 310", name: "COSC 310" })],
      isLoading: false,
      isSaving: false,
      selectActiveCourse,
    });

    render(<ActiveCourseSelector />);

    await user.selectOptions(
      screen.getByLabelText("Select active course"),
      "7",
    );

    expect(selectActiveCourse).toHaveBeenCalledWith(7);
  });
});
