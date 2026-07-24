import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActiveCourseSelector } from "@/components/courses/ActiveCourseSelector";
import type { InstructorCourse } from "@/types/course";

const mockSelectActiveCourse = vi.fn();
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
  beforeEach(() => {
    mockSelectActiveCourse.mockReset();
    mockUseActiveCourse.mockReset();
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  // #689 — Add missing frontend tests
  // Verifies: Renders course options and the current selection.
  it("renders available courses with the active course selected", () => {
    mockUseActiveCourse.mockReturnValue({
      activeCourse: {
        localId: 10,
        displayName: "COSC 499: Capstone",
      },
      availableCourses: [
        makeCourse({
          id: 10,
          name: "Capstone",
          code: "COSC 499",
          term: "2026S",
          studentCount: 20,
          assignmentCount: 4,
        }),
        makeCourse({
          id: 11,
          name: "Algorithms",
          code: "COSC 320",
          term: "2026S",
          studentCount: 40,
          assignmentCount: 6,
        }),
      ],
      isLoading: false,
      isSaving: false,
      selectActiveCourse: mockSelectActiveCourse,
    });

    render(<ActiveCourseSelector />);

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
    mockUseActiveCourse.mockReturnValue({
      activeCourse: {
        localId: 10,
        displayName: "COSC 499: Capstone",
      },
      availableCourses: [
        makeCourse({
          id: 10,
          name: "Capstone",
          code: "COSC 499",
          term: "2026S",
        }),
        makeCourse({
          id: 11,
          name: "Algorithms",
          code: "COSC 320",
          term: "2026S",
        }),
      ],
      isLoading: false,
      isSaving: false,
      selectActiveCourse: mockSelectActiveCourse,
    });

    render(<ActiveCourseSelector />);

    await user.selectOptions(
      screen.getByLabelText("Select active course"),
      "11",
    );

    expect(mockSelectActiveCourse).toHaveBeenCalledWith(11);
    expect(window.confirm).toHaveBeenCalled();
  });

  it("does not switch course when the instructor cancels the warning", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("confirm", vi.fn(() => false));
    mockUseActiveCourse.mockReturnValue({
      activeCourse: {
        localId: 10,
        displayName: "COSC 499: Capstone",
      },
      availableCourses: [
        makeCourse({
          id: 10,
          name: "Capstone",
          code: "COSC 499",
          term: "2026S",
        }),
        makeCourse({
          id: 11,
          name: "Algorithms",
          code: "COSC 320",
          term: "2026S",
        }),
      ],
      isLoading: false,
      isSaving: false,
      selectActiveCourse: mockSelectActiveCourse,
    });

    render(<ActiveCourseSelector />);

    await user.selectOptions(
      screen.getByLabelText("Select active course"),
      "11",
    );

    expect(mockSelectActiveCourse).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Select active course")).toHaveValue("10");
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

    render(<ActiveCourseSelector />);

    expect(screen.getByLabelText("Select active course")).toBeDisabled();
    expect(
      screen.getByRole("option", { name: "Loading courses..." }),
    ).toBeInTheDocument();
  });

  it("only lists published courses, using the shared course title format (not a raw code: name duplicate)", () => {
    mockUseActiveCourse.mockReturnValue({
      activeCourse: null,
      availableCourses: [
        makeCourse({ id: 1, code: "COSC 310", name: "COSC 310", isPublished: true }),
        makeCourse({ id: 2, code: "COSC 499", name: "COSC 499", isPublished: false }),
      ],
      isLoading: false,
      isSaving: false,
      selectActiveCourse: mockSelectActiveCourse,
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
      selectActiveCourse: mockSelectActiveCourse,
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
      selectActiveCourse: mockSelectActiveCourse,
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
    const user = userEvent.setup();
    mockUseActiveCourse.mockReturnValue({
      activeCourse: null,
      availableCourses: [makeCourse({ id: 7, code: "COSC 310", name: "COSC 310" })],
      isLoading: false,
      isSaving: false,
      selectActiveCourse: mockSelectActiveCourse,
    });

    render(<ActiveCourseSelector />);

    await user.selectOptions(
      screen.getByLabelText("Select active course"),
      "7",
    );

    expect(mockSelectActiveCourse).toHaveBeenCalledWith(7);
  });
});
