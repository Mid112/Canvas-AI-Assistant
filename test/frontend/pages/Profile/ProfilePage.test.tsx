import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProfilePage } from "@/pages/Profile/ProfilePage";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const mockLogout = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
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

describe("ProfilePage", () => {
  it("renders profile information and delete profile section", () => {
    renderWithRouter(<ProfilePage />);

    expect(screen.getByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(screen.getByLabelText("First Name")).toHaveValue("Jane");
    expect(screen.getByLabelText("Last Name")).toHaveValue("Doe");
    expect(screen.getByLabelText("Email Address")).toHaveValue(
      "professor@university.edu",
    );
    expect(screen.getByText("Account role")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete profile" })).toBeInTheDocument();
  });

  it("deletes profile when delete is clicked", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ProfilePage />);

    await user.click(screen.getByRole("button", { name: "Delete profile" }));

    expect(mockLogout).toHaveBeenCalled();
  });
});
