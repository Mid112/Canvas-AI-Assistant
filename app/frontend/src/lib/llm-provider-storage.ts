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

/** The wire shape the backend's ModelSettings expects.
 *
 * Never carries a key: credentials are resolved server-side from the
 * instructor's stored connection, and the backend rejects a client-supplied
 * api_key outright. This only names which connection to use.
 */
export interface ModelSettingsPayload {
  provider: string;
  model?: string;
  base_url?: string;
}

/** Shared by every endpoint that runs a model on the instructor's behalf —
 * chat, assignment drafts, message drafts. One mapping, because three copies
 * of it is how one of them ends up omitting a field nobody notices. */
export function toModelSettingsPayload(
  settings: LlmProviderSettings | null | undefined,
): ModelSettingsPayload | undefined {
  return settings
    ? {
        provider: settings.provider,
        model: settings.model || undefined,
        base_url: settings.baseUrl || undefined,
      }
    : undefined;
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
