import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InstructorDashboardActiveCourses } from "@/pages/Instructor/InstructorDashboard/InstructorDashboardActiveCourses";
import type { InstructorCourse } from "@/types/course";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const mockSelectActiveCourse = vi.fn();
const mockUseActiveCourse = vi.fn();

vi.mock("@/contexts/useActiveCourse", () => ({
  useActiveCourse: () => mockUseActiveCourse(),
}));

const courses: InstructorCourse[] = [
  {
    id: 1,
    code: "CS 101",
    name: "Intro to Programming",
    progress: 0,
    studentCount: 45,
    assignmentCount: 8,
    lastActivity: "Synced from Canvas",
    isPublished: true,
    isWritable: true,
    term: null,
  },
  {
    id: 2,
    code: "CS 401",
    name: "Advanced Topics",
    progress: 0,
    studentCount: 22,
    assignmentCount: 4,
    lastActivity: "Synced from Canvas",
    isPublished: true,
    isWritable: true,
    term: null,
  },
];

describe("InstructorDashboardActiveCourses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseActiveCourse.mockReturnValue({
      activeCourse: null,
      isSaving: false,
      selectActiveCourse: mockSelectActiveCourse,
    });
  });

  // Verifies: Renders active courses with assignment links.
  it("renders active courses with assignment links", () => {
    renderWithRouter(<InstructorDashboardActiveCourses courses={courses} />);

    expect(screen.getAllByText("Active Courses").length).toBeGreaterThan(0);
    expect(screen.getByText("CS 101: Intro to Programming")).toBeInTheDocument();
    expect(screen.getByText("45 students · 8 assignments")).toBeInTheDocument();
    expect(screen.getByText("CS 401: Advanced Topics")).toBeInTheDocument();

    expect(screen.getAllByRole("link", { name: "View" })[0]).toHaveAttribute(
      "href",
      "/instructor/courses/1",
    );
    expect(screen.getAllByRole("link", { name: "View" })[1]).toHaveAttribute(
      "href",
      "/instructor/courses/2",
    );
  });

  // Verifies: Renders an empty state when there are no courses.
  it("renders an empty state when there are no courses", () => {
    renderWithRouter(<InstructorDashboardActiveCourses courses={[]} />);

    expect(
      screen.getByText("No Canvas courses to display yet."),
    ).toBeInTheDocument();
  });

  // The dashboard previously offered View only, so switching course meant
  // leaving for the Courses tab or the assistant's dropdown. This is the
  // fourth surface that can set the active course, and they must all go
  // through the same context call rather than each rolling their own.
  it("sets a course active from the dashboard row", async () => {
    const user = userEvent.setup();
    renderWithRouter(<InstructorDashboardActiveCourses courses={courses} />);

    const buttons = screen.getAllByRole("button", { name: "Set Active" });
    expect(buttons).toHaveLength(2);

    await user.click(buttons[1]!);

    expect(mockSelectActiveCourse).toHaveBeenCalledWith(2, courses[1]);
  });

  // Verifies: the row that is already active says so and cannot be re-clicked.
  it("marks the active course instead of offering to set it again", () => {
    mockUseActiveCourse.mockReturnValue({
      activeCourse: { localId: 1, canvasCourseId: 101, displayName: "CS 101" },
      isSaving: false,
      selectActiveCourse: mockSelectActiveCourse,
    });

    renderWithRouter(<InstructorDashboardActiveCourses courses={courses} />);

    // Exact name, not /Active/: that also matches "Set Active".
    expect(screen.getByRole("button", { name: "Active" })).toBeDisabled();
    expect(
      screen.getAllByRole("button", { name: "Set Active" }),
    ).toHaveLength(1);
  });

  // Verifies: an unpublished course cannot be made active here either. Setting
  // one active is unsupported everywhere else (ActiveCourseSelector filters
  // them out entirely), so this surface must not be the one that allows it.
  it("refuses to set an unpublished course active and says why", () => {
    renderWithRouter(
      <InstructorDashboardActiveCourses
        courses={[{ ...courses[0]!, isPublished: false, isWritable: false }]}
      />,
    );

    const button = screen.getByRole("button", { name: "Set Active" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      "title",
      "Unpublished courses can't be set as the active course",
    );
  });
});
