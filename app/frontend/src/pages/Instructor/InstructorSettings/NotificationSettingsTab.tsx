// Instructor page note: coordinates notification settings tab UI state with Canvas-backed services and active-course context.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import {
  buildDefaultNotificationSettings,
  NOTIFICATION_PREFERENCE_GROUPS,
} from "@/lib/notification-preferences";
import { paths } from "@/routes/paths";
import {
  fetchNotificationSettings,
  updateNotificationSettings,
} from "@/services/auth";
import type { NotificationSettings } from "@/types/auth";

export function NotificationSettingsTab() {
  const { accessToken } = useAuth();
  const defaults = useMemo(() => buildDefaultNotificationSettings(), []);
  const [settings, setSettings] = useState<NotificationSettings>(defaults);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const token = accessToken;
    let cancelled = false;

    async function loadSettings() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const remoteSettings = await fetchNotificationSettings(token);

        if (cancelled) {
          return;
        }

        setSettings({ ...defaults, ...remoteSettings });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load notification preferences.",
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [accessToken, defaults]);

  const handleSave = async () => {
    if (!accessToken) {
      setErrorMessage("You need to sign in again before saving preferences.");
      setSavedMessage(null);
      return;
    }

    setIsSaving(true);
    setSavedMessage(null);
    setErrorMessage(null);

    try {
      const savedSettings = await updateNotificationSettings(
        accessToken,
        settings,
      );
      setSettings({ ...defaults, ...savedSettings });
      setSavedMessage("Notification preferences saved.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to save notification preferences.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader>
        <CardTitle>Notification Settings</CardTitle>
        <p className="text-sm text-muted-foreground">
          Choose which alerts appear on your{" "}
          <Link
            to={paths.instructor.notifications}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Notifications
          </Link>{" "}
          page. These preferences control in-app alerts from your Canvas
          dashboard data.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading preferences...</p>
        ) : null}

        {NOTIFICATION_PREFERENCE_GROUPS.map((group) => (
          <div key={group.title} className="space-y-3">
            <p className="text-sm font-semibold">{group.title}</p>
            <ul className="space-y-3">
              {group.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-4 rounded-lg border px-4 py-3"
                >
                  <div className="space-y-1">
                    <Label htmlFor={item.id} className="text-sm font-medium">
                      {item.label}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <input
                    id={item.id}
                    type="checkbox"
                    checked={Boolean(settings[item.id])}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        [item.id]: event.target.checked,
                      }))
                    }
                    className="mt-1 size-4 rounded border-input"
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}

        {savedMessage ? (
          <p role="status" className="text-sm text-emerald-700">
            {savedMessage}
          </p>
        ) : null}
        {errorMessage ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}

        <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Preferences"}
        </Button>
      </CardContent>
    </Card>
  );
}
