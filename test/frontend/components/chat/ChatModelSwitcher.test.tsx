// Test note: covers the chat model switcher.test behavior so future changes can preserve the expected Canvas workflow contract.

import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatModelSwitcher } from "@/components/chat/ChatModelSwitcher";
import { createDefaultLlmProviderSettings } from "@/data/llmProviders";

const providers = [
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
];

describe("ChatModelSwitcher", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the active provider and lets the user switch models", async () => {
    const onProviderChange = vi.fn();
    render(
      <MemoryRouter>
        <ChatModelSwitcher
          settings={createDefaultLlmProviderSettings("groq")}
          providers={providers}
          onProviderChange={onProviderChange}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch AI model" }));
    expect(await screen.findByText("AI model")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /Ollama/i }));
    expect(onProviderChange).toHaveBeenCalledWith("ollama");
  });

  it("disables disconnected providers in the switcher", async () => {
    render(
      <MemoryRouter>
        <ChatModelSwitcher
          settings={createDefaultLlmProviderSettings()}
          providers={providers}
          onProviderChange={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch AI model" }));
    expect(await screen.findByRole("menuitem", { name: /OpenAI/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("links to the AI Models settings page", async () => {
    render(
      <MemoryRouter>
        <ChatModelSwitcher
          settings={createDefaultLlmProviderSettings()}
          providers={providers}
          onProviderChange={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch AI model" }));
    expect(
      await screen.findByRole("menuitem", { name: /Manage models in Settings/i }),
    ).toBeInTheDocument();
  });
});
