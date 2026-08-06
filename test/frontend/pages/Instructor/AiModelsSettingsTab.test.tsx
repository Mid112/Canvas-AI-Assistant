// Test note: covers the ai models settings tab.test behavior so future changes can preserve the expected Canvas workflow contract.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AiModelsSettingsTab } from "@/pages/Instructor/InstructorSettings/AiModelsSettingsTab";

const mockUseAuth = vi.fn();
const mockFetchProviders = vi.hoisted(() => vi.fn());
const mockSaveConnection = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AuthContext", async () => {
  const actual = await vi.importActual<typeof import("@/contexts/AuthContext")>(
    "@/contexts/AuthContext",
  );

  return {
    ...actual,
    useAuth: () => mockUseAuth(),
  };
});

vi.mock("@/services/instructorLlmProviders", async () => {
  const actual = await vi.importActual<
    typeof import("@/services/instructorLlmProviders")
  >("@/services/instructorLlmProviders");
  return {
    ...actual,
    fetchInstructorLlmProviders: mockFetchProviders,
    saveLlmConnection: mockSaveConnection,
    deleteLlmConnection: vi.fn(),
  };
});

function providerCard(name: string) {
  const section = screen.getByRole("region", { name: "Available LLM providers" });
  return within(section)
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .closest("div");
}

const policy = {
  default_provider: "groq" as const,
  default_model: "qwen/qwen3.6-27b",
  providers: [
    {
      id: "groq" as const,
      name: "Groq",
      hosting: "internet" as const,
      default_model: "qwen/qwen3.6-27b",
      configured: true,
      status: "available" as const,
      models: ["qwen/qwen3.6-27b"],
      detail: null,
      connected: true,
      requires_api_key: false,
      accepts_api_key: true,
      has_api_key: false,
      saved_model: null,
      saved_base_url: null,
    },
    {
      id: "ollama" as const,
      name: "Ollama",
      hosting: "local" as const,
      default_model: "llama3.2",
      configured: true,
      status: "available" as const,
      models: ["llama3.2"],
      detail: null,
      connected: true,
      requires_api_key: false,
      accepts_api_key: false,
      has_api_key: false,
      saved_model: null,
      saved_base_url: null,
    },
    {
      id: "openai" as const,
      name: "OpenAI",
      hosting: "internet" as const,
      default_model: "gpt-4o-mini",
      configured: false,
      status: "unconfigured" as const,
      models: ["gpt-4o-mini"],
      detail: null,
      connected: false,
      requires_api_key: true,
      accepts_api_key: true,
      has_api_key: false,
      saved_model: null,
      saved_base_url: null,
    },
  ],
};

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
    mockFetchProviders.mockResolvedValue(policy);
    mockSaveConnection.mockResolvedValue({
      provider_id: "ollama",
      model: "llama3.2",
      base_url: null,
      has_api_key: false,
    });
  });

  it("shows connected providers and grey not-connected cards", async () => {
    render(
      <MemoryRouter>
        <AiModelsSettingsTab />
      </MemoryRouter>,
    );

    expect(await screen.findByText("AI Models")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Groq/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Ollama/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^OpenAI/ })).toBeInTheDocument();
    expect(within(providerCard("OpenAI")!).getByText("Not connected")).toBeInTheDocument();
    expect(within(providerCard("Groq")!).getByText("Connected")).toBeInTheDocument();
  });

  it("lets instructors connect a disconnected provider from its own card", async () => {
    mockSaveConnection.mockResolvedValue({
      provider_id: "openai",
      model: "gpt-4o-mini",
      base_url: null,
      has_api_key: true,
    });
    mockFetchProviders
      .mockResolvedValueOnce(policy)
      .mockResolvedValueOnce({
        ...policy,
        providers: policy.providers.map((provider) =>
          provider.id === "openai"
            ? {
                ...provider,
                connected: true,
                has_api_key: true,
                requires_api_key: true,
              }
            : provider,
        ),
      });

    render(
      <MemoryRouter>
        <AiModelsSettingsTab />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /^OpenAI/ }));
    const card = providerCard("OpenAI")!;
    expect(within(card).getByLabelText(/^API key$/)).toBeInTheDocument();
    fireEvent.change(within(card).getByLabelText(/^API key$/), {
      target: { value: "sk-test" },
    });
    fireEvent.click(within(card).getByRole("button", { name: "Connect" }));

    await waitFor(() => {
      expect(mockSaveConnection).toHaveBeenCalledWith(
        "token",
        "openai",
        expect.objectContaining({
          api_key: "sk-test",
          model: "gpt-4o-mini",
        }),
      );
    });
    expect(
      await within(card).findByText(/Connected OpenAI and set it as your preferred provider/),
    ).toBeInTheDocument();
  });

  it("shows an optional API key override on a hosted provider card", async () => {
    render(
      <MemoryRouter>
        <AiModelsSettingsTab />
      </MemoryRouter>,
    );

    // Groq is the default preferred provider and starts expanded.
    expect(
      await screen.findByLabelText(/API key \(optional override\)/),
    ).toBeInTheDocument();
  });

  it("saves settings from a connected provider card", async () => {
    render(
      <MemoryRouter>
        <AiModelsSettingsTab />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /^Ollama/ }));
    const card = providerCard("Ollama")!;
    fireEvent.click(within(card).getByRole("button", { name: "Save & use" }));

    expect(
      await within(card).findByText(/Connected Ollama and set it as your preferred provider|Saved Ollama/),
    ).toBeInTheDocument();
  });

  it("shows the hosted-provider privacy note on that provider card only", async () => {
    render(
      <MemoryRouter>
        <AiModelsSettingsTab />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/Prompts may be processed by an internet-hosted provider/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Ollama/ }));
    expect(
      within(providerCard("Ollama")!).queryByText(
        /Prompts may be processed by an internet-hosted provider/,
      ),
    ).not.toBeInTheDocument();
  });
});
