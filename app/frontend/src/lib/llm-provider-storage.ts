import {
  createDefaultLlmProviderSettings,
  getLlmProviderOption,
  LLM_PROVIDERS,
} from "@/data/llmProviders";
import type { LlmProviderId, LlmProviderSettings } from "@/types/llmProvider";

const STORAGE_PREFIX = "canvas-workflow-llm-provider";

function storageKey(userId: number): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

function isProviderId(value: unknown): value is LlmProviderId {
  return (
    typeof value === "string" &&
    LLM_PROVIDERS.some((provider) => provider.id === value)
  );
}

function isLlmProviderSettings(value: unknown): value is LlmProviderSettings {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<LlmProviderSettings>;
  return (
    isProviderId(candidate.provider) &&
    typeof candidate.model === "string" &&
    typeof candidate.baseUrl === "string"
  );
}

export function getStoredLlmProviderSettings(
  userId: number,
): LlmProviderSettings {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) {
      return createDefaultLlmProviderSettings();
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isLlmProviderSettings(parsed)) {
      return createDefaultLlmProviderSettings();
    }

    const option = getLlmProviderOption(parsed.provider);
    return {
      provider: parsed.provider,
      model: parsed.model.trim() || option.defaultModel,
      baseUrl: parsed.baseUrl.trim(),
    };
  } catch {
    return createDefaultLlmProviderSettings();
  }
}

export function setStoredLlmProviderSettings(
  userId: number,
  settings: LlmProviderSettings,
): void {
  const option = getLlmProviderOption(settings.provider);
  const normalized: LlmProviderSettings = {
    provider: settings.provider,
    model: settings.model.trim() || option.defaultModel,
    baseUrl: settings.baseUrl.trim(),
  };
  localStorage.setItem(storageKey(userId), JSON.stringify(normalized));
}
