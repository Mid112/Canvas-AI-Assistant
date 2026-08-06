// Test note: covers the active course sidebar badge.test behavior so future changes can preserve the expected Canvas workflow contract.

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ActiveCourseSidebarBadge } from "@/components/courses/ActiveCourseSidebarBadge";

const mockUseActiveCourse = vi.fn();

vi.mock("@/contexts/useActiveCourse", () => ({
  useActiveCourse: () => mockUseActiveCourse(),
}));

describe("ActiveCourseSidebarBadge", () => {
  // Verifies: Shows the active course's display name under the "Active course" label.
  it("shows the active course display name", () => {
    mockUseActiveCourse.mockReturnValue({
      activeCourse: { localId: 1, displayName: "CPSC 101: Intro to Programming" },
      isLoading: false,
    });

    render(<ActiveCourseSidebarBadge />);

    expect(screen.getByText("Active course")).toBeInTheDocument();
    expect(
      screen.getByText("CPSC 101: Intro to Programming"),
    ).toBeInTheDocument();
  });

  // Verifies: Shows a loading placeholder while the active course is being fetched.
  it("shows a loading placeholder while the active course loads", () => {
    mockUseActiveCourse.mockReturnValue({
      activeCourse: null,
      isLoading: true,
    });

    render(<ActiveCourseSidebarBadge />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  // Verifies: Shows an empty-state label when no course is selected.
  it("shows an empty-state label when no active course is selected", () => {
    mockUseActiveCourse.mockReturnValue({
      activeCourse: null,
      isLoading: false,
    });

    render(<ActiveCourseSidebarBadge />);

    expect(screen.getByText("No active course")).toBeInTheDocument();
  });
});
