import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InstructorAssistantPage } from "@/pages/Instructor/InstructorAssistantPage";
import { renderWithInstitution } from "@test/utils/renderWithInstitution";

const mockUseAuth = vi.fn();

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

vi.mock("@/services/assistant", () => ({
  AssistantApiError: class AssistantApiError extends Error {
    name = "AssistantApiError";
  },
  sendAssistantMessage: vi.fn(),
}));

beforeEach(() => {
  mockUseAuth.mockReturnValue({
    user: {
      id: 1,
      email: "jane.doe@example.com",
      name: "Dr. Jane Doe",
      role: "instructor",
      is_active: true,
      has_canvas_token: true,
      canvas_connections: [
        {
          id: 1,
          canvas_url: "https://canvas.ubc.ca",
          created_at: "2026-06-26T00:00:00.000Z",
        },
      ],
    },
    accessToken: "token",
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  });
});

describe("InstructorAssistantPage", () => {
  it("renders the assistant header, suggested actions, and chat", () => {
    renderWithInstitution(<InstructorAssistantPage />);

    expect(screen.getByText("AI Assistant")).toBeInTheDocument();
    expect(
      screen.getByText("Canvas Workflow Management Assistant"),
    ).toBeInTheDocument();
    expect(screen.getByText("Suggested actions")).toBeInTheDocument();
    expect(screen.getByText("Show missing submissions")).toBeInTheDocument();
    expect(
      screen.getByText(/Hello! I'm your Canvas AI Assistant/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Chat message" }),
    ).toBeInTheDocument();
  });

  it("renders chat without a connected Canvas account", () => {
    mockUseAuth.mockReturnValue({
      user: {
        id: 1,
        email: "jane.doe@example.com",
        name: "Dr. Jane Doe",
        role: "instructor",
        is_active: true,
        has_canvas_token: false,
        canvas_connections: [],
      },
      accessToken: "token",
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    renderWithInstitution(<InstructorAssistantPage />);

    expect(
      screen.getByText(/You can use the assistant now for general guidance/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Chat message" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Active course context")).not.toBeInTheDocument();
  });
});
