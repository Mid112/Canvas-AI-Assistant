import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InstructorCoursesSearch } from "@/pages/Instructor/InstructorCourses/InstructorCoursesSearch";

describe("InstructorCoursesSearch", () => {
  // Verifies: Renders the search input.
  it("renders the search input", () => {
    render(
      <InstructorCoursesSearch search="" onSearchChange={vi.fn()} />,
    );

    expect(screen.getByLabelText("Search courses")).toBeInTheDocument();
  });

  // Verifies: Calls onSearchChange when typing.
  it("calls onSearchChange when typing", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();

    render(
      <InstructorCoursesSearch search="" onSearchChange={onSearchChange} />,
    );

    await user.type(screen.getByLabelText("Search courses"), "cs");

    expect(onSearchChange).toHaveBeenCalled();
  });
});
