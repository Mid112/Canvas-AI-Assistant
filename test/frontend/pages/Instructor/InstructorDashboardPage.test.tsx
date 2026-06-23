import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { useInstitution } from "@/contexts/useInstitution";
import { InstructorDashboardPage } from "@/pages/Instructor/InstructorDashboardPage";
import { paths } from "@/routes/paths";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: () => ({
      user: {
        id: 1,
        email: "jane.doe@example.com",
        name: "Dr. Jane Doe",
        role: "instructor",
        is_active: true,
        has_canvas_token: true,
      },
      accessToken: "token",
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    }),
  };
});

function InstitutionSwitchHarness() {
  const { setSelectedInstitution } = useInstitution();

  return (
    <>
      <button type="button" onClick={() => setSelectedInstitution("ubco")}>
        Switch to UBCO
      </button>
      <InstructorDashboardPage />
    </>
  );
}

describe("InstructorDashboardPage", () => {
  it("renders institution-specific dashboard data", () => {
    renderWithInstitution(<InstructorDashboardPage />);

    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Welcome back, Dr. Jane Doe. Overview for UBC."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Active Courses").length).toBeGreaterThan(0);
    expect(screen.getByText("Total Students")).toBeInTheDocument();
    expect(screen.getByText("Missing Submissions")).toBeInTheDocument();
    expect(screen.getByText("Pending Approvals")).toBeInTheDocument();
    expect(screen.getByText("156")).toBeInTheDocument();
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    expect(screen.getByText("Quick AI Actions")).toBeInTheDocument();
    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(
      screen.getAllByText(/CS 101: Intro to Programming/).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText("Dashboard coming soon"),
    ).not.toBeInTheDocument();
  });

  it("updates dashboard analytics when the institution changes", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<InstitutionSwitchHarness />);

    expect(screen.getByText(/Overview for UBC/)).toBeInTheDocument();
    expect(screen.getByText("156")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch to UBCO" }));

    expect(screen.getByText(/Overview for UBCO/)).toBeInTheDocument();
    expect(screen.getByText("108")).toBeInTheDocument();
    expect(
      screen.getAllByText(/COSC 111: Computer Programming I/).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("156")).not.toBeInTheDocument();
  });

  it("navigates to the assistant from the dashboard CTA", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();

    renderWithInstitution(<InstructorDashboardPage />);

    await user.click(
      screen.getByRole("button", { name: "Open AI Assistant" }),
    );
    expect(mockNavigate).toHaveBeenCalledWith(paths.instructor.assistant);
  });
});
