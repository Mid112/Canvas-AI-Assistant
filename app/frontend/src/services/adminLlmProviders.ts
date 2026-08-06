// Frontend service note: wraps admin llm providers API calls and normalizes payloads for route/components.

import { apiRequest } from "@/lib/api-request";

export type LlmProviderHealth =
  | "available"
  | "configured"
  | "unavailable"
  | "unconfigured";

export interface AdminLlmProvider {
  id: string;
  name: string;
  hosting: "local" | "internet" | "custom";
  default_model: string;
  configured: boolean;
  status: LlmProviderHealth;
  models: string[];
  detail: string | null;
}

export interface AdminLlmConfig {
  provider: string;
  model: string;
  fallback_provider: string | null;
  fallback_model: string | null;
  cache_enabled: boolean;
  cache_ttl_seconds: number;
}

export interface AdminLlmProviderResponse {
  config: AdminLlmConfig;
  providers: AdminLlmProvider[];
}

const ADMIN_LLM_PROVIDERS_PATH = "/admin/llm/providers";

export function fetchAdminLlmProviders(
  accessToken: string,
): Promise<AdminLlmProviderResponse> {
  return apiRequest<AdminLlmProviderResponse>(
    ADMIN_LLM_PROVIDERS_PATH,
    accessToken,
  );
}

export function updateAdminLlmProviders(
  accessToken: string,
  config: AdminLlmConfig,
): Promise<AdminLlmProviderResponse> {
  return apiRequest<AdminLlmProviderResponse>(
    ADMIN_LLM_PROVIDERS_PATH,
    accessToken,
    {
      method: "PUT",
      body: JSON.stringify(config),
    },
  );
}
