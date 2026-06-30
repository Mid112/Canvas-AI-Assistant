import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { InstructorSettingsPage } from "@/pages/Instructor/InstructorSettingsPage";
import { renderWithRouter } from "@test/utils/renderWithRouter";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: 1,
      email: "professor@university.edu",
      name: "Professor",
      role: "instructor",
      is_active: true,
      has_canvas_token: false,
      canvas_connections: [],
    },
    accessToken: "access-token",
    refreshUser: vi.fn(),
  }),
}));

describe("InstructorSettingsPage", () => {
  it("renders settings tabs and opens canvas tab from query param", () => {
    renderWithRouter(
      <Routes>
        <Route path="/instructor/settings" element={<InstructorSettingsPage />} />
      </Routes>,
      {
        routerProps: {
          initialEntries: ["/instructor/settings?tab=canvas"],
        },
      },
    );

    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Canvas Connection" })).toBeInTheDocument();
    expect(screen.getByText(/No Canvas connection yet/i)).toBeInTheDocument();
  });
});
