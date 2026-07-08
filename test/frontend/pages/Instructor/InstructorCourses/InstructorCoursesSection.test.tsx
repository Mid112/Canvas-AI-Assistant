import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { institutionCourseData } from "@/data/institutionCourseData";
import {
  InstructorCoursesCard,
  InstructorCoursesEmptyState,
  InstructorCoursesList,
  InstructorCoursesSection,
} from "@/pages/Instructor/InstructorCourses/InstructorCoursesSection";
import { instructorCoursePath } from "@/routes/paths";

const courses = institutionCourseData[0]!.courses.slice(0, 2);

const activeCourseProps = {
  activeCourseId: null as number | null,
  onSetActiveCourse: vi.fn(),
  settingActiveCourseId: null as number | null,
};

describe("InstructorCoursesCard", () => {
  // Verifies: Renders course progress and action buttons.
  it("renders course progress and action buttons", () => {
    render(
      <MemoryRouter>
        <InstructorCoursesCard
          course={courses[0]!}
          isActive={false}
          onSetActive={vi.fn()}
          isSettingActive={false}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("CS 101: Introduction to Programming"),
    ).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View Course" }),
    ).toHaveAttribute("href", instructorCoursePath(1));
    expect(
      screen.getByRole("button", { name: "Set Active" }),
    ).toBeInTheDocument();
  });

  // Verifies: Shows per-course feedback while setting active.
  it("shows per-course feedback while setting active", () => {
    render(
      <MemoryRouter>
        <InstructorCoursesCard
          course={courses[0]!}
          isActive={false}
          onSetActive={vi.fn()}
          isSettingActive
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("button", { name: "Setting active..." }),
    ).toBeDisabled();
  });

  // Verifies: Shows a clear active state.
  it("shows a clear active state", () => {
    render(
      <MemoryRouter>
        <InstructorCoursesCard
          course={courses[0]!}
          isActive
          onSetActive={vi.fn()}
          isSettingActive={false}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("button", { name: "Active Course" }),
    ).toBeDisabled();
  });
});

describe("InstructorCoursesList", () => {
  // Verifies: Renders courses in list format.
  it("renders courses in list format", () => {
    render(
      <MemoryRouter>
        <InstructorCoursesList
          courses={courses}
          {...activeCourseProps}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("CS 101: Introduction to Programming"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/45 students · 8 assignments/),
    ).toBeInTheDocument();
  });

  // Verifies: Shows loading feedback only for the selected list row.
  it("shows loading feedback only for the selected list row", () => {
    render(
      <MemoryRouter>
        <InstructorCoursesList
          courses={courses}
          activeCourseId={null}
          onSetActiveCourse={vi.fn()}
          settingActiveCourseId={courses[1]!.id}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Setting..." })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Set Active" })).toHaveLength(1);
  });
});

describe("InstructorCoursesSection", () => {
  // Verifies: Renders grid view by default.
  it("renders grid view by default", () => {
    render(
      <MemoryRouter>
        <InstructorCoursesSection
          courses={courses}
          viewMode="grid"
          onViewModeChange={vi.fn()}
          {...activeCourseProps}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Your Courses (2)")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "View Course" })).toHaveLength(
      2,
    );
  });

  // Verifies: Switches to list view when requested.
  it("switches to list view when requested", async () => {
    const user = userEvent.setup();
    const onViewModeChange = vi.fn();

    render(
      <MemoryRouter>
        <InstructorCoursesSection
          courses={courses}
          viewMode="grid"
          onViewModeChange={onViewModeChange}
          {...activeCourseProps}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "List View" }));

    expect(onViewModeChange).toHaveBeenCalledWith("list");
  });
});

describe("InstructorCoursesEmptyState", () => {
  // Verifies: Renders the empty state message.
  it("renders the empty state message", () => {
    render(<InstructorCoursesEmptyState />);

    expect(screen.getByText("No courses found")).toBeInTheDocument();
    expect(
      screen.getByText("Try adjusting your search."),
    ).toBeInTheDocument();
  });
});
