import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { sharedDashboardQuickActions } from "@/types/dashboard";
import { InstructorDashboardQuickActions } from "@/pages/Instructor/InstructorDashboard/InstructorDashboardQuickActions";
import { paths } from "@/routes/paths";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("InstructorDashboardQuickActions", () => {
  it("renders quick action cards", () => {
    renderWithRouter(
      <InstructorDashboardQuickActions
        actions={sharedDashboardQuickActions}
      />,
    );

    expect(screen.getByText("Quick AI Actions")).toBeInTheDocument();
    expect(screen.getByText("Create Assignment")).toBeInTheDocument();
    expect(screen.getByText("Draft Announcement")).toBeInTheDocument();
    expect(screen.getByText("Grade Analysis")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open AI Assistant" }),
    ).toBeInTheDocument();
  });

  it("navigates to assignment creator or assistant from quick actions", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();

    renderWithRouter(
      <InstructorDashboardQuickActions
        actions={sharedDashboardQuickActions}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /Create Assignment/i }),
    );
    expect(mockNavigate).toHaveBeenCalledWith(paths.instructor.assignmentCreate);

    mockNavigate.mockClear();
    await user.click(
      screen.getByRole("button", { name: /Draft Announcement/i }),
    );
    expect(mockNavigate).toHaveBeenCalledWith(paths.instructor.assistant);

    mockNavigate.mockClear();
    await user.click(
      screen.getByRole("button", { name: "Open AI Assistant" }),
    );
    expect(mockNavigate).toHaveBeenCalledWith(paths.instructor.assistant);
  });
});
