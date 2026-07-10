import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChatModelSwitcher } from "@/components/chat/ChatModelSwitcher";
import { createDefaultLlmProviderSettings } from "@/data/llmProviders";

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
          onProviderChange={onProviderChange}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Switch AI model" }));
    expect(await screen.findByText("AI model")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /Ollama/i }));
    expect(onProviderChange).toHaveBeenCalledWith("ollama");
  });

  it("links to the AI Models settings page", async () => {
    render(
      <MemoryRouter>
        <ChatModelSwitcher
          settings={createDefaultLlmProviderSettings()}
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
