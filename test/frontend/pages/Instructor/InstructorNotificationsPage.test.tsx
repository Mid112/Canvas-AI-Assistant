import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
      refreshUser: vi.fn(),
    }),
  };
});

describe("InstructorNotificationsPage", () => {
  // Verifies: Renders the notifications page with an empty state when Canvas is connected.
  it("renders the notifications page with an empty state when Canvas is connected", () => {
    renderWithInstitution(<InstructorNotificationsPage />);

    expect(
      screen.getByRole("heading", { name: "Notifications" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Updates for Dr. Jane Doe at UBC."),
    ).toBeInTheDocument();
    expect(screen.getByText(/No notifications yet/)).toBeInTheDocument();
  });
});
