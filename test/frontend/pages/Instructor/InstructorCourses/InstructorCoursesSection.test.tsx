import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { institutionCourseData } from "@/data/institutionCourseData";
import {
  InstructorCoursesCard,
  InstructorCoursesList,
} from "@/pages/Instructor/InstructorCourses/InstructorCoursesSection";
import { instructorCoursePath } from "@/routes/paths";

const courses = institutionCourseData[0]!.courses.slice(0, 2);

const publishProps = {
  onTogglePublish: vi.fn(),
  isTogglingPublish: false,
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
          {...publishProps}
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
    expect(
      screen.getByRole("button", { name: "Unpublish" }),
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
          {...publishProps}
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
          {...publishProps}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("button", { name: "Active Course" }),
    ).toBeDisabled();
  });

  it("shows an Unpublished badge and disables Set Active for an unpublished course", () => {
    render(
      <MemoryRouter>
        <InstructorCoursesCard
          course={{ ...courses[0]!, isPublished: false, isWritable: false }}
          isActive={false}
          onSetActive={vi.fn()}
          isSettingActive={false}
          {...publishProps}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Unpublished")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set Active" })).toBeDisabled();
  });

  it("calls onTogglePublish when Publish is clicked", async () => {
    const user = userEvent.setup();
    const onTogglePublish = vi.fn();

    render(
      <MemoryRouter>
        <InstructorCoursesCard
          course={{ ...courses[0]!, isPublished: false, isWritable: false }}
          isActive={false}
          onSetActive={vi.fn()}
          isSettingActive={false}
          onTogglePublish={onTogglePublish}
          isTogglingPublish={false}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Publish" }));
    expect(onTogglePublish).toHaveBeenCalledWith(true);
  });

  it("hides publish controls for completed courses", () => {
    render(
      <MemoryRouter>
        <InstructorCoursesCard
          course={{ ...courses[0]!, isPublished: true, isWritable: false }}
          isActive={false}
          onSetActive={vi.fn()}
          isSettingActive={false}
          {...publishProps}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Unpublish" })).not.toBeInTheDocument();
  });
});

describe("InstructorCoursesList", () => {
  // Verifies: Shows loading feedback only for the selected list row.
  it("shows loading feedback only for the selected list row", () => {
    render(
      <MemoryRouter>
        <InstructorCoursesList
          courses={courses}
          activeCourseId={null}
          onSetActiveCourse={vi.fn()}
          settingActiveCourseId={courses[1]!.id}
          onTogglePublish={vi.fn()}
          togglingPublishCourseId={null}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Setting..." })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Set Active" })).toHaveLength(1);
  });
});


