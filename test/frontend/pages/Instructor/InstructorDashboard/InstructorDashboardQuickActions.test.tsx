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
  // Verifies: Renders quick action cards.
  it("renders quick action cards", () => {
    renderWithRouter(
      <InstructorDashboardQuickActions
        actions={sharedDashboardQuickActions}
      />,
    );

    expect(screen.getByText("Quick AI Actions")).toBeInTheDocument();
    expect(screen.getByText("Create Assignment")).toBeInTheDocument();
    expect(screen.getByText("Draft Announcement")).toBeInTheDocument();
    expect(screen.getByText("Analyse Missing Submissions")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open AI Assistant" }),
    ).toBeInTheDocument();
  });

  // Verifies: Navigates to assignment creator or assistant from quick actions.
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
    expect(mockNavigate).toHaveBeenCalledWith(paths.instructor.assistant, {
      state: {
        initialPrompt:
          "Draft a student message or course announcement for my active course. Propose a send_message action I can review and edit before sending.",
      },
    });

    mockNavigate.mockClear();
    await user.click(
      screen.getByRole("button", { name: /Analyse Missing Submissions/i }),
    );
    expect(mockNavigate).toHaveBeenCalledWith(paths.instructor.assistant, {
      state: {
        initialPrompt:
          "Analyse missing submissions for my active course. Show the overview and list the students who haven't submitted.",
      },
    });

    mockNavigate.mockClear();
    await user.click(
      screen.getByRole("button", { name: "Open AI Assistant" }),
    );
    expect(mockNavigate).toHaveBeenCalledWith(paths.instructor.assistant);
  });

  // Verifies: Opens the assistant for unknown quick action ids.
  it("opens the assistant for unknown quick action ids", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();

    renderWithRouter(
      <InstructorDashboardQuickActions
        actions={[
          {
            id: "custom-action",
            title: "Custom Action",
            description: "Fallback to assistant",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Custom Action/i }));

    expect(mockNavigate).toHaveBeenCalledWith(paths.instructor.assistant);
  });
});
