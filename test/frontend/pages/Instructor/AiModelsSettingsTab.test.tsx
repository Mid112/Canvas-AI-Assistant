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
      screen.getByText(/Saved Ollama as your preferred provider/),
    ).toBeInTheDocument();
  });

  it("clarifies the selection is only a saved preference", () => {
    render(
      <MemoryRouter>
        <AiModelsSettingsTab />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/does not yet change which service handles your prompts/),
    ).toBeInTheDocument();
  });

  it("always shows the server-provider privacy note", () => {
    render(
      <MemoryRouter>
        <AiModelsSettingsTab />
      </MemoryRouter>,
    );

    // The note is not conditional on the selected provider because the choice
    // does not yet change the server-configured model.
    expect(
      screen.getByText("Prompts are processed by the server's AI provider"),
    ).toBeInTheDocument();

    fireEvent.click(providerButton(/Ollama/i));
    expect(
      screen.getByText("Prompts are processed by the server's AI provider"),
    ).toBeInTheDocument();
  });
});
