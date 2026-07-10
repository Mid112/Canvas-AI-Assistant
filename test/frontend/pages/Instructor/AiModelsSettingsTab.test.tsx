import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AiModelsSettingsTab } from "@/pages/Instructor/InstructorSettings/AiModelsSettingsTab";

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

function providerButton(name: RegExp | string) {
  const section = screen.getByRole("region", { name: "Available LLM providers" });
  return within(section).getByRole("button", { name });
}

describe("AiModelsSettingsTab", () => {
  beforeEach(() => {
    localStorage.clear();
    mockUseAuth.mockReturnValue({
      user: {
        id: 7,
        email: "jane.doe@example.com",
        name: "Dr. Jane Doe",
        role: "instructor",
        is_active: true,
        has_canvas_token: true,
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
  });

  it("lists providers and persists selection", () => {
    render(
      <MemoryRouter>
        <AiModelsSettingsTab />
      </MemoryRouter>,
    );

    expect(screen.getByText("AI Models")).toBeInTheDocument();
    expect(providerButton(/Groq/i)).toBeInTheDocument();
    expect(providerButton(/Ollama/i)).toBeInTheDocument();

    fireEvent.click(providerButton(/Ollama/i));
    fireEvent.click(screen.getByRole("button", { name: "Save provider" }));

    expect(
      screen.getByText(/Saved Ollama for the AI Assistant/),
    ).toBeInTheDocument();
  });

  it("warns for internet-hosted providers", () => {
    render(
      <MemoryRouter>
        <AiModelsSettingsTab />
      </MemoryRouter>,
    );

    fireEvent.click(providerButton(/^OpenAI\b/i));
    expect(
      screen.getByText("Internet-hosted provider selected"),
    ).toBeInTheDocument();
  });
});
