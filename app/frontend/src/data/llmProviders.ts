// Mock data note: supplies llm providers fixtures for UI development and frontend tests.

import type {
  LlmProviderId,
  LlmProviderOption,
  LlmProviderSettings,
} from "@/types/llmProvider";

/** Catalog of providers the AI Assistant can target (frontend preference). */
export const LLM_PROVIDERS: LlmProviderOption[] = [
  {
    id: "huggingface",
    name: "Hugging Face",
    description: "The server's current default model, routed through Hugging Face's inference API.",
    hosting: "internet",
    availability: "ready",
    defaultModel: "openai/gpt-oss-20b:groq",
    configFields: ["model"],
  },
  {
    id: "groq",
    name: "Groq",
    description: "Fast hosted models via Groq’s OpenAI-compatible API.",
    hosting: "internet",
    availability: "ready",
    defaultModel: "qwen/qwen3.6-27b",
    configFields: ["model"],
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "Run models locally with Ollama on your machine.",
    hosting: "local",
    availability: "requires_local_runtime",
    defaultModel: "llama3.2",
    configFields: ["model"],
  },
  {
    id: "vllm",
    name: "vLLM",
    description: "Local OpenAI-compatible server for self-hosted models.",
    hosting: "local",
    availability: "requires_local_runtime",
    defaultModel: "Qwen/Qwen3-4B",
    configFields: ["model"],
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "Hosted GPT models via the OpenAI API.",
    hosting: "internet",
    availability: "requires_server_key",
    defaultModel: "gpt-4o-mini",
    configFields: ["model"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Hosted Claude models via the Anthropic API.",
    hosting: "internet",
    availability: "requires_server_key",
    defaultModel: "claude-sonnet-4-5",
    configFields: ["model"],
  },
  {
    id: "openai_compatible_custom",
    name: "Custom OpenAI-compatible",
    description: "Any other OpenAI-compatible endpoint (Together, Fireworks, etc.).",
    hosting: "custom",
    availability: "requires_server_key",
    defaultModel: "",
    configFields: ["baseUrl", "model"],
  },
];

// Matches the backend's own settings.DEFAULT_LLM_PROVIDER (app/backend/app/config.py)
// — a user who has never touched the AI Models settings page must see (and
// keep sending) the model that's actually already answering their messages,
// not silently jump to a different provider the first time this preference
// starts being honored.
export const DEFAULT_LLM_PROVIDER_ID: LlmProviderId = "huggingface";

export function getLlmProviderOption(
  providerId: LlmProviderId,
): LlmProviderOption {
  return (
    LLM_PROVIDERS.find((provider) => provider.id === providerId) ??
    LLM_PROVIDERS[0]!
  );
}

export function createDefaultLlmProviderSettings(
  providerId: LlmProviderId = DEFAULT_LLM_PROVIDER_ID,
): LlmProviderSettings {
  const option = getLlmProviderOption(providerId);
  return {
    provider: option.id,
    model: option.defaultModel,
    baseUrl: "",
  };
}

export function isInternetHostedProvider(providerId: LlmProviderId): boolean {
  const hosting = getLlmProviderOption(providerId).hosting;
  return hosting === "internet" || hosting === "custom";
}

export function availabilityLabel(
  availability: LlmProviderOption["availability"],
): string {
  switch (availability) {
    case "ready":
      return "Ready";
    case "requires_local_runtime":
      return "Needs local runtime";
    case "requires_server_key":
      return "Needs server key";
  }
}

export function hostingLabel(hosting: LlmProviderOption["hosting"]): string {
  switch (hosting) {
    case "local":
      return "Local";
    case "internet":
      return "Internet-hosted";
    case "custom":
      return "Custom endpoint";
  }
}
