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

const courses = institutionCourseData[0]!.courses.slice(0, 2);

describe("InstructorCoursesCard", () => {
  it("renders course progress and action buttons", () => {
    render(
      <MemoryRouter>
        <InstructorCoursesCard course={courses[0]!} />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("CS 101: Introduction to Programming"),
    ).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View Course" }),
    ).toHaveAttribute("href", "/instructor/courses/1/assignments");
    expect(
      screen.getByRole("button", { name: "Analytics" }),
    ).toBeInTheDocument();
  });
});

describe("InstructorCoursesList", () => {
  it("renders courses in list format", () => {
    render(
      <MemoryRouter>
        <InstructorCoursesList courses={courses} />
      </MemoryRouter>,
    );

    expect(
      screen.getByText("CS 101: Introduction to Programming"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/45 students · 8 assignments/),
    ).toBeInTheDocument();
  });
});

describe("InstructorCoursesSection", () => {
  it("renders grid view by default", () => {
    render(
      <MemoryRouter>
        <InstructorCoursesSection
          courses={courses}
          viewMode="grid"
          onViewModeChange={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Your Courses (2)")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "View Course" })).toHaveLength(
      2,
    );
  });

  it("switches to list view when requested", async () => {
    const user = userEvent.setup();
    const onViewModeChange = vi.fn();

    render(
      <MemoryRouter>
        <InstructorCoursesSection
          courses={courses}
          viewMode="grid"
          onViewModeChange={onViewModeChange}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "List View" }));

    expect(onViewModeChange).toHaveBeenCalledWith("list");
  });
});

describe("InstructorCoursesEmptyState", () => {
  it("renders the empty state message", () => {
    render(<InstructorCoursesEmptyState />);

    expect(screen.getByText("No courses found")).toBeInTheDocument();
    expect(
      screen.getByText("Try adjusting your search or switch institutions."),
    ).toBeInTheDocument();
  });
});
