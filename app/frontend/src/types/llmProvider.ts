/** Provider ids aligned with backend `get_llm_adapter` providers. */
export type LlmProviderId =
  | "huggingface"
  | "groq"
  | "ollama"
  | "vllm"
  | "openai"
  | "anthropic"
  | "openai_compatible_custom";

export type LlmProviderHosting = "local" | "internet" | "custom";

export type LlmProviderAvailability =
  | "ready"
  | "requires_local_runtime"
  | "requires_server_key";

export interface LlmProviderOption {
  id: LlmProviderId;
  name: string;
  description: string;
  hosting: LlmProviderHosting;
  availability: LlmProviderAvailability;
  defaultModel: string;
  /** Extra fields shown when this provider is selected. */
  configFields: Array<"model" | "baseUrl">;
}

export interface LlmProviderSettings {
  provider: LlmProviderId;
  model: string;
  baseUrl: string;
}
