import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InstructorAssistantPage } from "@/pages/Instructor/InstructorAssistantPage";
import { renderWithRouter } from "@test/utils/renderWithRouter";

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: () => ({
      accessToken: "access-token",
      user: { name: "Dr. Jane Doe", role: "instructor" },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    }),
  };
});

vi.mock("@/services/assistant", () => ({
  AssistantApiError: class AssistantApiError extends Error {
    name = "AssistantApiError";
  },
  sendAssistantMessage: vi.fn(),
}));

describe("InstructorAssistantPage", () => {
  it("renders the assistant header, suggested actions, and chat", () => {
    renderWithRouter(<InstructorAssistantPage />);

    expect(screen.getByText("AI Assistant")).toBeInTheDocument();
    expect(
      screen.getByText("Canvas Workflow Management Assistant"),
    ).toBeInTheDocument();
    expect(screen.getByText("Suggested Actions")).toBeInTheDocument();
    expect(screen.getByText("Show missing submissions")).toBeInTheDocument();
    expect(
      screen.getByText(/Hello! I'm your Canvas AI Assistant/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Chat message" }),
    ).toBeInTheDocument();
  });
});
