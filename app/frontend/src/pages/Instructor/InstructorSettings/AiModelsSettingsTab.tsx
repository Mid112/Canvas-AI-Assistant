import { AlertTriangle, CheckCircle2, Circle, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import {
  availabilityLabel,
  createDefaultLlmProviderSettings,
  getLlmProviderOption,
  hostingLabel,
  isInternetHostedProvider,
  LLM_PROVIDERS,
} from "@/data/llmProviders";
import {
  getStoredLlmProviderSettings,
  setStoredLlmProviderSettings,
} from "@/lib/llm-provider-storage";
import { cn } from "@/lib/utils";
import type { LlmProviderId, LlmProviderSettings } from "@/types/llmProvider";

/** Settings page for adding/configuring AI models used by the Assistant. */
export function AiModelsSettingsTab() {
  const { user } = useAuth();
  const userId = user?.id;
  const [settings, setSettings] = useState<LlmProviderSettings>(() =>
    userId ? getStoredLlmProviderSettings(userId) : createDefaultLlmProviderSettings(),
  );
  const [previousUserId, setPreviousUserId] = useState(userId);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  if (userId !== previousUserId) {
    setPreviousUserId(userId);
    if (userId) {
      setSettings(getStoredLlmProviderSettings(userId));
    }
  }

  const selected = useMemo(
    () => getLlmProviderOption(settings.provider),
    [settings.provider],
  );
  const showInternetWarning = isInternetHostedProvider(settings.provider);

  if (!userId) {
    return (
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Sign in to manage AI models for the Assistant.
        </CardContent>
      </Card>
    );
  }

  const updateSettings = (next: LlmProviderSettings) => {
    setSettings(next);
    setSavedMessage(null);
  };

  const selectProvider = (providerId: LlmProviderId) => {
    const option = getLlmProviderOption(providerId);
    updateSettings({
      provider: providerId,
      model: option.defaultModel,
      baseUrl: providerId === "openai_compatible_custom" ? settings.baseUrl : "",
    });
  };

  const handleSave = () => {
    setStoredLlmProviderSettings(userId, settings);
    const persisted = getStoredLlmProviderSettings(userId);
    setSettings(persisted);
    setSavedMessage(
      `Saved ${getLlmProviderOption(persisted.provider).name} for the AI Assistant.`,
    );
  };

  const handleReset = () => {
    updateSettings(createDefaultLlmProviderSettings());
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="size-4" aria-hidden="true" />
            AI Models
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Add and configure LLM providers for the AI Assistant. Switch the
            active model from the chat input; save detailed options here.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <section aria-label="Available LLM providers" className="space-y-3" role="region">
            <h3 className="text-sm font-semibold">Available providers</h3>
            <div className="grid gap-3">
              {LLM_PROVIDERS.map((provider) => {
                const isActive = provider.id === settings.provider;
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => selectProvider(provider.id)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      isActive
                        ? "border-primary bg-primary/5"
                        : "border-border/70 hover:border-primary/40 hover:bg-muted/40",
                    )}
                    aria-pressed={isActive}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">{provider.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {provider.description}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isActive ? (
                          <Badge className="gap-1">
                            <CheckCircle2 className="size-3" aria-hidden="true" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <Circle className="size-3" aria-hidden="true" />
                            Inactive
                          </Badge>
                        )}
                        <Badge variant="secondary">
                          {hostingLabel(provider.hosting)}
                        </Badge>
                        <Badge variant="outline">
                          {availabilityLabel(provider.availability)}
                        </Badge>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section
            aria-label={`${selected.name} configuration`}
            className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4"
          >
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">
                {selected.name} configuration
              </h3>
              <p className="text-sm text-muted-foreground">
                Provider-specific options. API keys stay on the server.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                Status: {availabilityLabel(selected.availability)}
              </Badge>
              <Badge variant="outline">
                Hosting: {hostingLabel(selected.hosting)}
              </Badge>
            </div>

            {selected.configFields.includes("baseUrl") ? (
              <div className="space-y-2">
                <Label htmlFor="llm-base-url">Base URL</Label>
                <Input
                  id="llm-base-url"
                  value={settings.baseUrl}
                  placeholder="https://api.example.com/v1"
                  onChange={(event) =>
                    updateSettings({ ...settings, baseUrl: event.target.value })
                  }
                />
              </div>
            ) : null}

            {selected.configFields.includes("model") ? (
              <div className="space-y-2">
                <Label htmlFor="llm-model">Model</Label>
                <Input
                  id="llm-model"
                  value={settings.model}
                  placeholder={selected.defaultModel || "model-id"}
                  onChange={(event) =>
                    updateSettings({ ...settings, model: event.target.value })
                  }
                />
              </div>
            ) : null}
          </section>

          {showInternetWarning ? (
            <div
              role="status"
              className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950"
            >
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-amber-700"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <p className="font-medium">Internet-hosted provider selected</p>
                <p className="text-amber-900/80">
                  {selected.name} sends prompts over the internet to a third-party
                  service. Avoid pasting sensitive student data unless your
                  institution allows it.
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={handleSave}>
              Save provider
            </Button>
            <Button type="button" variant="outline" onClick={handleReset}>
              Reset to Groq default
            </Button>
            {savedMessage ? (
              <p className="text-sm text-muted-foreground" role="status">
                {savedMessage}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
