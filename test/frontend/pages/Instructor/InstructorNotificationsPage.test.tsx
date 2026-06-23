import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { useInstitution } from "@/contexts/InstitutionContext";
import { InstructorNotificationsPage } from "@/pages/Instructor/InstructorNotificationsPage";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

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
      <InstructorNotificationsPage />
    </>
  );
}

describe("InstructorNotificationsPage", () => {
  it("renders institution-specific notifications", () => {
    renderWithInstitution(<InstructorNotificationsPage />);

    expect(
      screen.getByRole("heading", { name: "Notifications" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Updates for Dr. Jane Doe at UBC."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("12 submissions pending review"),
    ).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("updates notifications when the institution changes", async () => {
    const user = userEvent.setup();

    renderWithInstitution(<InstitutionSwitchHarness />);

    expect(
      screen.getByText("12 submissions pending review"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Switch to UBCO" }));

    expect(
      screen.getByText("6 submissions pending review"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Updates for Dr. Jane Doe at UBCO."),
    ).toBeInTheDocument();
  });
});
