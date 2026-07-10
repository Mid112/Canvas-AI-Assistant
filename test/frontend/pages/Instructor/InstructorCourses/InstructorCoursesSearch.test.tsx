import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InstructorCoursesSearch } from "@/pages/Instructor/InstructorCourses/InstructorCoursesSearch";

describe("InstructorCoursesSearch", () => {
  // Verifies: Renders the search input.
  it("renders the search input", () => {
    render(
      <InstructorCoursesSearch
        search=""
        onSearchChange={vi.fn()}
        publishFilter="all"
        onPublishFilterChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Search courses")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Published" })).toBeInTheDocument();
  });

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
  });

  it("calls onPublishFilterChange when a status filter is selected", async () => {
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

    await user.click(screen.getByRole("button", { name: "Unpublished" }));
    expect(onPublishFilterChange).toHaveBeenCalledWith("unpublished");
  });
});
