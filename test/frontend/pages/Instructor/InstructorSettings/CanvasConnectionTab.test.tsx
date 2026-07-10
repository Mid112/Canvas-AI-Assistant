import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasConnectionTab } from "@/pages/Instructor/InstructorSettings/CanvasConnectionTab";
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

vi.mock("@/lib/useCanvasTokenValidation", () => ({
  useCanvasTokenValidation: () => ({
    isValidating: false,
    validation: { status: "idle" },
    urlError: null,
    validate: vi.fn(),
    reset: vi.fn(),
  }),
}));

describe("CanvasConnectionTab", () => {
  // #689 / #692 — Settings Canvas connection empty and reconnect path
  // Verifies: Empty state explains how to connect and shows form fields.
  it("shows the empty connection state and connect form fields", () => {
    renderWithRouter(<CanvasConnectionTab />);

    expect(
      screen.getByText(/No Canvas connection yet/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Canvas URL/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Canvas API Token/i)).toBeInTheDocument();
  });
});
