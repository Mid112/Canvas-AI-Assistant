import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InstructorCoursesSearch } from "@/pages/Instructor/InstructorCourses/InstructorCoursesSearch";

describe("InstructorCoursesSearch", () => {
  // Verifies: Calls onSearchChange when typing.
  it("calls onSearchChange when typing", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();

    render(
      <InstructorCoursesSearch
        search=""
        onSearchChange={onSearchChange}
        publishFilter="all"
        onPublishFilterChange={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText("Search courses"), "cs");

    expect(onSearchChange).toHaveBeenCalled();
  });  it("calls onPublishFilterChange when a different option is selected", async () => {
    const user = userEvent.setup();
    const onPublishFilterChange = vi.fn();

    render(
      <InstructorCoursesSearch
        search=""
        onSearchChange={vi.fn()}
        publishFilter="all"
        onPublishFilterChange={onPublishFilterChange}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText("Filter by publish status"),
      "published",
    );

    expect(onPublishFilterChange).toHaveBeenCalledWith("published");
  });
});
