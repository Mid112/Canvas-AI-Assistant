import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProfilePage } from "@/pages/Profile/ProfilePage";
import { deleteCurrentUser } from "@/services/auth";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const mockLogout = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    accessToken: "access-token",
    user: {
      id: 1,
      email: "professor@university.edu",
      name: "Jane Doe",
      role: "instructor",
      is_active: true,
      has_canvas_token: true,
      canvas_connections: [],
    },
    logout: mockLogout,
  }),
}));

vi.mock("@/services/auth", () => ({
  deleteCurrentUser: vi.fn().mockResolvedValue(undefined),
}));

describe("ProfilePage", () => {
  // Verifies: Renders profile information and delete profile section.
  it("renders profile information and delete profile section", () => {
    renderWithRouter(<ProfilePage />);

    expect(
      screen.getByRole("heading", { name: "Profile" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("First Name")).toHaveValue("Jane");
    expect(screen.getByLabelText("Last Name")).toHaveValue("Doe");
    expect(screen.getByLabelText("Email Address")).toHaveValue(
      "professor@university.edu",
    );
    expect(screen.getByText("Account role")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete profile" }),
    ).toBeInTheDocument();
  });

  // Verifies: Deletes profile when delete is clicked.
  it("deletes profile when delete is clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ProfilePage />);

    await user.type(screen.getByLabelText("Confirm Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Delete profile" }));

    expect(deleteCurrentUser).toHaveBeenCalledWith(
      "access-token",
      "password123",
    );
    expect(mockLogout).toHaveBeenCalled();
  });
});
