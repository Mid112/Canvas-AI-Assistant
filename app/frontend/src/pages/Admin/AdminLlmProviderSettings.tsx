import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchAdminLlmProviders,
  updateAdminLlmProviders,
  type AdminLlmConfig,
  type AdminLlmProvider,
  type AdminLlmProviderResponse,
} from "@/services/adminLlmProviders";

function statusLabel(provider: AdminLlmProvider) {
  return provider.status === "available"
    ? "Available"
    : provider.status === "configured"
      ? "Configured"
      : provider.status === "unavailable"
        ? "Unavailable"
        : "Not configured";
}

export function AdminLlmProviderSettings() {
  const { accessToken } = useAuth();
  const [data, setData] = useState<AdminLlmProviderResponse | null>(null);
  const [config, setConfig] = useState<AdminLlmConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void fetchAdminLlmProviders(accessToken)
      .then((response) => {
        if (cancelled) return;
        setData(response);
        setConfig(response.config);
      })
      .catch(() => {
        if (!cancelled) setError("Unable to load AI provider settings.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const configuredProviders = useMemo(
    () => data?.providers.filter((provider) => provider.configured) ?? [],
    [data?.providers],
  );

  const defaultModels = useMemo(() => {
    if (!config) return [];
    const provider = data?.providers.find((item) => item.id === config.provider);
    return provider?.models.length
      ? provider.models
      : provider?.default_model
        ? [provider.default_model]
        : [];
  }, [config, data?.providers]);

  const fallbackModels = useMemo(() => {
    if (!config?.fallback_provider) return [];
    const provider = data?.providers.find(
      (item) => item.id === config.fallback_provider,
    );
    return provider?.models.length
      ? provider.models
      : provider?.default_model
        ? [provider.default_model]
        : [];
  }, [config?.fallback_provider, data?.providers]);

  async function handleSave() {
    if (!accessToken || !config) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await updateAdminLlmProviders(accessToken, config);
      setData(response);
      setConfig(response.config);
      setSuccess("AI defaults saved.");
    } catch {
      setError("Unable to save AI provider settings.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Loading AI provider settings...
        </CardContent>
      </Card>
    );
  }

  if (!config || !data) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive" role="alert">
          {error ?? "Unable to load AI provider settings."}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader>
        <CardTitle className="text-base">AI provider defaults</CardTitle>
        <p className="text-sm text-muted-foreground">
          Set the institution default for new instructors and background
          workflows. Instructors connect their own providers in Settings.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="default-provider">Default provider</Label>
            <select
              id="default-provider"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={config.provider}
              onChange={(event) => {
                const providerId = event.target.value;
                const provider = data.providers.find(
                  (item) => item.id === providerId,
                );
                setConfig({
                  ...config,
                  provider: providerId,
                  model: provider?.default_model ?? config.model,
                });
              }}
            >
              {data.providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="default-model">Default model</Label>
            {defaultModels.length ? (
              <select
                id="default-model"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={config.model}
                onChange={(event) =>
                  setConfig({ ...config, model: event.target.value })
                }
              >
                {defaultModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id="default-model"
                value={config.model}
                onChange={(event) =>
                  setConfig({ ...config, model: event.target.value })
                }
              />
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="fallback-provider">Fallback provider</Label>
            <select
              id="fallback-provider"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={config.fallback_provider ?? ""}
              onChange={(event) => {
                const providerId = event.target.value || null;
                const provider = data.providers.find(
                  (item) => item.id === providerId,
                );
                setConfig({
                  ...config,
                  fallback_provider: providerId,
                  fallback_model: provider?.default_model ?? null,
                });
              }}
            >
              <option value="">None</option>
              {configuredProviders
                .filter((provider) => provider.id !== config.provider)
                .map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fallback-model">Fallback model</Label>
            {fallbackModels.length ? (
              <select
                id="fallback-model"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={config.fallback_model ?? ""}
                disabled={!config.fallback_provider}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    fallback_model: event.target.value || null,
                  })
                }
              >
                {fallbackModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id="fallback-model"
                value={config.fallback_model ?? ""}
                disabled={!config.fallback_provider}
                onChange={(event) =>
                  setConfig({
                    ...config,
                    fallback_model: event.target.value || null,
                  })
                }
              />
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={config.cache_enabled}
              onChange={(event) =>
                setConfig({ ...config, cache_enabled: event.target.checked })
              }
            />
            Enable response caching
          </label>
          <div className="space-y-2">
            <Label htmlFor="cache-ttl">Cache TTL (seconds)</Label>
            <Input
              id="cache-ttl"
              type="number"
              min={30}
              max={86400}
              value={config.cache_ttl_seconds}
              disabled={!config.cache_enabled}
              onChange={(event) =>
                setConfig({
                  ...config,
                  cache_ttl_seconds: Number(event.target.value) || 300,
                })
              }
            />
          </div>
        </div>

        {config.fallback_provider ? (
          <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Failover only runs when the selected provider transport fails. It
            may route prompts to a different hosted service.
          </div>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Server provider status</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (!accessToken) return;
                void fetchAdminLlmProviders(accessToken).then(setData);
              }}
            >
              <RefreshCw className="mr-2 size-4" />
              Refresh
            </Button>
          </div>
          <div className="grid gap-2">
            {data.providers.map((provider) => (
              <div
                key={provider.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">{provider.name}</p>
                  <p className="text-muted-foreground">
                    {provider.detail ?? "No additional details."}
                  </p>
                </div>
                <Badge variant="outline">{statusLabel(provider)}</Badge>
              </div>
            ))}
          </div>
        </section>
      </CardContent>
      <CardFooter className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save AI defaults"}
        </Button>
        {success ? (
          <p className="text-sm text-muted-foreground" role="status">
            {success}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </CardFooter>
    </Card>
  );
}
