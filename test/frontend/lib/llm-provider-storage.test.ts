import { beforeEach, describe, expect, it } from "vitest";

import {
  getStoredLlmProviderSettings,
  setStoredLlmProviderSettings,
} from "@/lib/llm-provider-storage";

describe("llm-provider-storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to Hugging Face when nothing is stored", () => {
    expect(getStoredLlmProviderSettings(42)).toEqual({
      provider: "huggingface",
      model: "openai/gpt-oss-20b:groq",
      baseUrl: "",
    });
  });

  it("persists and restores a provider selection", () => {
    setStoredLlmProviderSettings(42, {
      provider: "ollama",
      model: "llama3.2",
      baseUrl: "",
    });

    expect(getStoredLlmProviderSettings(42)).toEqual({
      provider: "ollama",
      model: "llama3.2",
      baseUrl: "",
    });
  });

  it("falls back to defaults for corrupt storage", () => {
    localStorage.setItem("canvas-workflow-llm-provider:42", "{not-json");

    expect(getStoredLlmProviderSettings(42).provider).toBe("huggingface");
  });

  it("scopes storage per user", () => {
    setStoredLlmProviderSettings(1, {
      provider: "vllm",
      model: "Qwen/Qwen3-4B",
      baseUrl: "",
    });
    setStoredLlmProviderSettings(2, {
      provider: "openai",
      model: "gpt-4o-mini",
      baseUrl: "",
    });

    expect(getStoredLlmProviderSettings(1).provider).toBe("vllm");
    expect(getStoredLlmProviderSettings(2).provider).toBe("openai");
  });
});
