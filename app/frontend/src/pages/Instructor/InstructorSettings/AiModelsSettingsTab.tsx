// Instructor page note: coordinates ai models settings tab UI state with Canvas-backed services and active-course context.

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Circle,
  Info,
  Settings2,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import {
  createDefaultLlmProviderSettings,
  getLlmProviderOption,
  hostingLabel,
  LLM_PROVIDERS,
} from "@/data/llmProviders";
import {
  getStoredLlmProviderSettings,
  setStoredLlmProviderSettings,
} from "@/lib/llm-provider-storage";
import { cn } from "@/lib/utils";
import {
  deleteLlmConnection,
  fetchInstructorLlmProviders,
  resolveConnectedSettings,
  saveLlmConnection,
  type InstructorLlmProvider,
} from "@/services/instructorLlmProviders";
import type { LlmProviderId, LlmProviderSettings } from "@/types/llmProvider";

type MergedProvider = InstructorLlmProvider & {
  description: string;
  configFields: Array<"model" | "baseUrl">;
};

type ProviderDraft = {
  model: string;
  baseUrl: string;
  apiKey: string;
};

function mergeProviders(catalog: InstructorLlmProvider[]): MergedProvider[] {
  return LLM_PROVIDERS.map((option) => {
    const remote = catalog.find((provider) => provider.id === option.id);
    const acceptsApiKey =
      remote?.accepts_api_key ??
      (option.hosting === "internet" || option.hosting === "custom");
    return {
      id: option.id,
      name: option.name,
      description: option.description,
      configFields: option.configFields,
      hosting: option.hosting,
      default_model: option.defaultModel,
      configured: remote?.configured ?? false,
      status: remote?.status ?? "unconfigured",
      models: remote?.models.length
        ? remote.models
        : [option.defaultModel].filter(Boolean),
      detail: remote?.detail ?? null,
      connected: remote?.connected ?? false,
      requires_api_key:
        remote?.requires_api_key ?? option.availability === "requires_server_key",
      accepts_api_key: acceptsApiKey,
      has_api_key: remote?.has_api_key ?? false,
      saved_model: remote?.saved_model ?? null,
      saved_base_url: remote?.saved_base_url ?? null,
    };
  });
}

function draftForProvider(provider: MergedProvider): ProviderDraft {
  const option = getLlmProviderOption(provider.id);
  return {
    model: provider.saved_model ?? provider.models[0] ?? option.defaultModel,
    baseUrl: provider.saved_base_url ?? "",
    apiKey: "",
  };
}

/** Settings page for connecting and choosing AI models used by the Assistant. */
export function AiModelsSettingsTab() {
  const { accessToken, user } = useAuth();
  const userId = user?.id;
  const [providers, setProviders] = useState<MergedProvider[]>([]);
  const [preferred, setPreferred] = useState<LlmProviderSettings>(() =>
    userId ? getStoredLlmProviderSettings(userId) : createDefaultLlmProviderSettings(),
  );
  const [expandedId, setExpandedId] = useState<LlmProviderId | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<LlmProviderId, ProviderDraft>>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [statusByProvider, setStatusByProvider] = useState<
    Partial<Record<LlmProviderId, { message: string; tone: "ok" | "error" }>>
  >({});
  const [savingId, setSavingId] = useState<LlmProviderId | null>(null);

  useEffect(() => {
    if (!accessToken || !userId) return;
    let cancelled = false;
    void fetchInstructorLlmProviders(accessToken)
      .then((policy) => {
        if (cancelled) return;
        const merged = mergeProviders(policy.providers);
        const resolved = resolveConnectedSettings(
          policy,
          getStoredLlmProviderSettings(userId),
        );
        setProviders(merged);
        setPreferred(resolved);
        setStoredLlmProviderSettings(userId, resolved);
        setExpandedId(resolved.provider);
        setDrafts(
          Object.fromEntries(
            merged.map((provider) => [provider.id, draftForProvider(provider)]),
          ) as Partial<Record<LlmProviderId, ProviderDraft>>,
        );
        setError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Unable to load AI provider status.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, userId]);

  if (!userId) {
    return (
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Sign in to manage AI models for the Assistant.
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive" role="alert">
          {error}
        </CardContent>
      </Card>
    );
  }

  if (!providers.length) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Loading AI providers...
        </CardContent>
      </Card>
    );
  }

  function updateDraft(providerId: LlmProviderId, patch: Partial<ProviderDraft>) {
    setDrafts((current) => {
      const provider = providers.find((item) => item.id === providerId);
      const base = current[providerId] ?? (provider ? draftForProvider(provider) : {
        model: "",
        baseUrl: "",
        apiKey: "",
      });
      return { ...current, [providerId]: { ...base, ...patch } };
    });
    setStatusByProvider((current) => {
      const next = { ...current };
      delete next[providerId];
      return next;
    });
  }

  function toggleExpanded(providerId: LlmProviderId) {
    setExpandedId((current) => (current === providerId ? null : providerId));
    setDrafts((current) => {
      if (current[providerId]) return current;
      const provider = providers.find((item) => item.id === providerId);
      if (!provider) return current;
      return { ...current, [providerId]: draftForProvider(provider) };
    });
  }

  function setAsPreferred(provider: MergedProvider) {
    if (!userId || !provider.connected) return;
    const draft = drafts[provider.id] ?? draftForProvider(provider);
    const next: LlmProviderSettings = {
      provider: provider.id,
      model: draft.model || provider.default_model,
      baseUrl: draft.baseUrl || provider.saved_base_url || "",
    };
    setPreferred(next);
    setStoredLlmProviderSettings(userId, next);
    setStatusByProvider((current) => ({
      ...current,
      [provider.id]: {
        message: `${provider.name} is now your preferred provider.`,
        tone: "ok",
      },
    }));
  }

  async function handleSave(provider: MergedProvider) {
    if (!accessToken || !userId) return;
    const draft = drafts[provider.id] ?? draftForProvider(provider);
    setSavingId(provider.id);
    setStatusByProvider((current) => {
      const next = { ...current };
      delete next[provider.id];
      return next;
    });

    try {
      const body: {
        api_key?: string;
        model?: string;
        base_url?: string;
      } = {
        model: draft.model || undefined,
      };
      if (draft.apiKey.trim()) {
        body.api_key = draft.apiKey.trim();
      }
      if (provider.configFields.includes("baseUrl")) {
        body.base_url =
          draft.baseUrl.trim() || provider.saved_base_url || undefined;
      }

      await saveLlmConnection(accessToken, provider.id, body);

      const policy = await fetchInstructorLlmProviders(accessToken);
      const merged = mergeProviders(policy.providers);
      const updated = merged.find((item) => item.id === provider.id);
      setProviders(merged);
      setDrafts((current) => ({
        ...current,
        [provider.id]: updated
          ? { ...draftForProvider(updated), apiKey: "" }
          : { ...draft, apiKey: "" },
      }));

      if (updated?.connected) {
        const next: LlmProviderSettings = {
          provider: provider.id,
          model:
            updated.saved_model ??
            draft.model ??
            updated.models[0] ??
            provider.default_model,
          baseUrl: updated.saved_base_url ?? draft.baseUrl,
        };
        setPreferred(next);
        setStoredLlmProviderSettings(userId, next);
        setStatusByProvider((current) => ({
          ...current,
          [provider.id]: {
            message: `Connected ${provider.name} and set it as your preferred provider.`,
            tone: "ok",
          },
        }));
      } else {
        setStatusByProvider((current) => ({
          ...current,
          [provider.id]: {
            message: `Saved ${provider.name} settings. This provider is not ready for chat yet.`,
            tone: "ok",
          },
        }));
      }
    } catch (requestError) {
      setStatusByProvider((current) => ({
        ...current,
        [provider.id]: {
          message:
            requestError instanceof Error
              ? requestError.message
              : "Unable to save this provider connection.",
          tone: "error",
        },
      }));
    } finally {
      setSavingId(null);
    }
  }

  async function handleDisconnect(provider: MergedProvider) {
    if (!accessToken || !userId) return;
    setSavingId(provider.id);
    try {
      await deleteLlmConnection(accessToken, provider.id);
      const policy = await fetchInstructorLlmProviders(accessToken);
      const merged = mergeProviders(policy.providers);
      const resolved = resolveConnectedSettings(policy, preferred);
      setProviders(merged);
      setPreferred(resolved);
      setStoredLlmProviderSettings(userId, resolved);
      setDrafts((current) => ({
        ...current,
        [provider.id]: draftForProvider(
          merged.find((item) => item.id === provider.id) ?? provider,
        ),
      }));
      setStatusByProvider((current) => ({
        ...current,
        [provider.id]: {
          message: `Disconnected ${provider.name}.`,
          tone: "ok",
        },
      }));
    } catch (requestError) {
      setStatusByProvider((current) => ({
        ...current,
        [provider.id]: {
          message:
            requestError instanceof Error
              ? requestError.message
              : "Unable to disconnect this provider.",
          tone: "error",
        },
      }));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="size-4" aria-hidden="true" />
            AI Models
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Expand a provider to connect it or change its settings. Connected
            providers can be used in the Assistant.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div
            role="note"
            className="flex gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-3 text-sm text-muted-foreground"
          >
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              <span className="font-medium text-emerald-700">Green</span> means
              connected (ready to use).{" "}
              <span className="font-medium text-sky-700">Blue / Active</span> is
              your preferred chat provider on this browser. Grey cards still need an API
              key or local runtime — expand one to connect it.
            </p>
          </div>

          <section
            aria-label="Available LLM providers"
            className="space-y-3"
            role="region"
          >
            <div className="grid gap-3">
              {providers.map((provider) => {
                const isPreferred = provider.id === preferred.provider;
                const isConnected = provider.connected;
                const isExpanded = expandedId === provider.id;
                const draft = drafts[provider.id] ?? draftForProvider(provider);
                const status = statusByProvider[provider.id];
                const isSaving = savingId === provider.id;
                const saveLabel = isConnected
                  ? isPreferred
                    ? "Save settings"
                    : "Save & use"
                  : provider.requires_api_key
                    ? "Connect"
                    : "Save & use";

                return (
                  <div
                    key={provider.id}
                    className={cn(
                      "rounded-lg border transition-colors",
                      isPreferred
                        ? "border-sky-400 bg-sky-50 text-foreground"
                        : isConnected
                          ? "border-emerald-300 bg-emerald-50/60 text-foreground"
                          : "border-border/60 bg-muted/25 text-muted-foreground",
                    )}
                  >
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-3 p-3 text-left"
                      onClick={() => toggleExpanded(provider.id)}
                      aria-expanded={isExpanded}
                      aria-controls={`provider-config-${provider.id}`}
                    >
                      <div className="min-w-0 space-y-1">
                        <p
                          className={cn(
                            "text-sm font-medium",
                            isConnected
                              ? "text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {provider.name}
                        </p>
                        <p
                          className={cn(
                            "text-sm",
                            isConnected
                              ? "text-muted-foreground"
                              : "text-muted-foreground/80",
                          )}
                        >
                          {provider.description}
                        </p>
                        {!isConnected && provider.has_api_key && provider.detail ? (
                          <p
                            className="flex items-start gap-1 text-sm text-destructive"
                            role="alert"
                          >
                            <AlertTriangle
                              className="mt-0.5 size-3.5 shrink-0"
                              aria-hidden="true"
                            />
                            {provider.detail}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                        {isPreferred ? (
                          <Badge className="gap-1 border-transparent bg-sky-600 text-white hover:bg-sky-600/90">
                            <CheckCircle2
                              className="size-3"
                              aria-hidden="true"
                            />
                            Active
                          </Badge>
                        ) : null}
                        {isConnected ? (
                          <Badge className="gap-1 border-transparent bg-emerald-600 text-white hover:bg-emerald-600/90">
                            <Circle
                              className="size-3 fill-current"
                              aria-hidden="true"
                            />
                            Connected
                          </Badge>
                        ) : provider.has_api_key && provider.status === "unauthorized" ? (
                          <Badge className="gap-1 border-transparent bg-destructive text-white hover:bg-destructive/90">
                            Key rejected
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-muted-foreground/30 text-muted-foreground"
                          >
                            Not connected
                          </Badge>
                        )}
                        <Badge variant="secondary">
                          {hostingLabel(provider.hosting)}
                        </Badge>
                        <ChevronDown
                          className={cn(
                            "size-4 text-muted-foreground transition-transform",
                            isExpanded && "rotate-180",
                          )}
                          aria-hidden="true"
                        />
                      </div>
                    </button>

                    {isExpanded ? (
                      <div
                        id={`provider-config-${provider.id}`}
                        className="space-y-3 border-t border-border/60 px-3 pb-3 pt-3"
                      >
                        <p className="text-xs text-muted-foreground">
                          API keys are Fernet-encrypted on the server and never
                          returned to the browser.
                        </p>

                        {provider.configFields.includes("baseUrl") ? (
                          <div className="space-y-2">
                            <Label htmlFor={`llm-base-url-${provider.id}`}>
                              Base URL
                            </Label>
                            <Input
                              id={`llm-base-url-${provider.id}`}
                              value={draft.baseUrl}
                              placeholder="https://api.example.com/v1"
                              onChange={(event) =>
                                updateDraft(provider.id, {
                                  baseUrl: event.target.value,
                                })
                              }
                            />
                          </div>
                        ) : null}

                        {provider.configFields.includes("model") ? (
                          <div className="space-y-2">
                            <Label htmlFor={`llm-model-${provider.id}`}>
                              Model
                            </Label>
                            <Input
                              id={`llm-model-${provider.id}`}
                              value={draft.model}
                              placeholder={provider.default_model || "model-id"}
                              onChange={(event) =>
                                updateDraft(provider.id, {
                                  model: event.target.value,
                                })
                              }
                            />
                          </div>
                        ) : null}

                        {provider.accepts_api_key ? (
                          <div className="space-y-2">
                            <Label htmlFor={`llm-api-key-${provider.id}`}>
                              API key
                              {provider.requires_api_key
                                ? ""
                                : " (optional override)"}
                            </Label>
                            <Input
                              id={`llm-api-key-${provider.id}`}
                              type="password"
                              value={draft.apiKey}
                              placeholder={
                                provider.has_api_key
                                  ? "Saved key on server (enter to replace)"
                                  : provider.requires_api_key
                                    ? "Paste your API key"
                                    : "Paste a personal API key to override the server key"
                              }
                              onChange={(event) =>
                                updateDraft(provider.id, {
                                  apiKey: event.target.value,
                                })
                              }
                            />
                          </div>
                        ) : null}

                        {provider.hosting === "internet" ||
                        provider.hosting === "custom" ? (
                          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                            <AlertTriangle
                              className="mt-0.5 size-3.5 shrink-0 text-amber-700"
                              aria-hidden="true"
                            />
                            Prompts may be processed by an internet-hosted
                            provider. Avoid sensitive student data unless your
                            institution allows it.
                          </div>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleSave(provider)}
                            disabled={isSaving}
                          >
                            {isSaving ? "Saving..." : saveLabel}
                          </Button>
                          {isConnected && !isPreferred ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setAsPreferred(provider)}
                              disabled={isSaving}
                            >
                              Use as preferred
                            </Button>
                          ) : null}
                          {provider.has_api_key ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void handleDisconnect(provider)}
                              disabled={isSaving}
                            >
                              Disconnect
                            </Button>
                          ) : null}
                          {status ? (
                            <p
                              className={cn(
                                "text-sm",
                                status.tone === "error"
                                  ? "text-destructive"
                                  : "text-muted-foreground",
                              )}
                              role={status.tone === "error" ? "alert" : "status"}
                            >
                              {status.message}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
