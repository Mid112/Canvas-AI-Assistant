import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchAdminSettings,
  updateAdminSettings,
  type AdminSettings,
} from "@/services/adminSettings";

export function AdminSettingsPage() {
  const { accessToken } = useAuth();
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const data = await fetchAdminSettings(accessToken);
        if (!cancelled) {
          setSettings(data);
          setLoadError(null);
        }
      } catch {
        if (!cancelled) {
          setLoadError("Unable to load admin settings.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleSave() {
    if (!accessToken || !settings) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSuccessMessage(null);

    try {
      const updated = await updateAdminSettings(accessToken, settings);
      setSettings(updated);
      setSuccessMessage("Settings saved successfully.");
    } catch {
      setSaveError("Unable to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <p className="text-sm text-muted-foreground">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 md:p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Admin Settings
        </h1>
        <p className="text-muted-foreground">
          Configure organization policies, integrations, and system defaults.
        </p>
      </header>

      <Card className="max-w-2xl shadow-sm ring-1 ring-border/60">
        <CardHeader>
          <CardTitle>Organization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="organization-name">Organization name</Label>
            <Input
              id="organization-name"
              value={settings.organization_name}
              onChange={(event) =>
                setSettings((current) =>
                  current
                    ? { ...current, organization_name: event.target.value }
                    : current,
                )
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="self-registration">
                Allow instructor self-registration
              </Label>
              <p className="text-sm text-muted-foreground">
                Let instructors create accounts without admin approval.
              </p>
            </div>
            <input
              id="self-registration"
              type="checkbox"
              className="size-4 rounded border border-input"
              checked={settings.allow_instructor_self_registration}
              onChange={(event) =>
                setSettings((current) =>
                  current
                    ? {
                        ...current,
                        allow_instructor_self_registration: event.target.checked,
                      }
                    : current,
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="session-timeout">Session timeout (minutes)</Label>
            <Input
              id="session-timeout"
              type="number"
              min={5}
              value={settings.session_timeout_minutes}
              onChange={(event) =>
                setSettings((current) =>
                  current
                    ? {
                        ...current,
                        session_timeout_minutes: Number(event.target.value) || 30,
                      }
                    : current,
                )
              }
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-2">
          <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save settings"}
          </Button>
          {saveError ? (
            <p role="alert" className="text-sm text-destructive">
              {saveError}
            </p>
          ) : null}
          {successMessage ? (
            <p className="text-sm text-emerald-600">{successMessage}</p>
          ) : null}
        </CardFooter>
      </Card>
    </div>
  );
}
