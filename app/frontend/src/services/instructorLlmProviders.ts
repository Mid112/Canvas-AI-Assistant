import { apiRequest } from "@/lib/api-request";
import type { LlmProviderId } from "@/types/llmProvider";

export interface InstructorLlmProvider {
  id: LlmProviderId;
  name: string;
  hosting: "local" | "internet" | "custom";
  default_model: string;
  configured: boolean;
  status: "available" | "configured" | "unavailable" | "unconfigured";
  models: string[];
  detail: string | null;
  connected: boolean;
  requires_api_key: boolean;
  accepts_api_key: boolean;
  has_api_key: boolean;
  saved_model: string | null;
  saved_base_url: string | null;
}

export interface InstructorLlmProviderPolicy {
  default_provider: LlmProviderId;
  default_model: string;
  providers: InstructorLlmProvider[];
}

export interface LlmConnectionUpdate {
  api_key?: string;
  model?: string;
  base_url?: string;
}

export interface LlmConnectionResponse {
  provider_id: string;
  model: string | null;
  base_url: string | null;
  has_api_key: boolean;
}

export function fetchInstructorLlmProviders(
  accessToken: string,
): Promise<InstructorLlmProviderPolicy> {
  return apiRequest<InstructorLlmProviderPolicy>("/llm/providers", accessToken);
}

export function saveLlmConnection(
  accessToken: string,
  providerId: LlmProviderId,
  body: LlmConnectionUpdate,
): Promise<LlmConnectionResponse> {
  return apiRequest<LlmConnectionResponse>(
    `/llm/connections/${providerId}`,
    accessToken,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
  );
}

export function deleteLlmConnection(
  accessToken: string,
  providerId: LlmProviderId,
): Promise<void> {
  return apiRequest<void>(`/llm/connections/${providerId}`, accessToken, {
    method: "DELETE",
  });
}

export function resolveConnectedSettings(
  policy: InstructorLlmProviderPolicy,
  stored: { provider: LlmProviderId; model: string; baseUrl: string },
) {
  const provider = policy.providers.find((item) => item.id === stored.provider);
  if (provider?.connected) {
    const model = provider.models.includes(stored.model)
      ? stored.model
      : provider.saved_model ?? provider.models[0] ?? provider.default_model;
    return {
      provider: provider.id,
      model,
      baseUrl: provider.saved_base_url ?? stored.baseUrl ?? "",
    };
  }

  const connected = policy.providers.find((item) => item.connected);
  if (connected) {
    return {
      provider: connected.id,
      model:
        connected.saved_model ??
        connected.models[0] ??
        connected.default_model,
      baseUrl: connected.saved_base_url ?? "",
    };
  }

  return {
    provider: policy.default_provider,
    model: policy.default_model,
    baseUrl: "",
  };
}
