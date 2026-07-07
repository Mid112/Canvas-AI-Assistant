import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchNotificationSettings,
  updateNotificationSettings,
} from "@/services/auth";
import type { NotificationSettings } from "@/types/auth";

interface NotificationToggle {
  id: string;
  label: string;
  description: string;
  defaultChecked: boolean;
}

const notificationGroups: { title: string; items: NotificationToggle[] }[] = [
  {
    title: "Email Notifications",
    items: [
      {
        id: "workflow-approvals",
        label: "Workflow Approvals",
        description: "Get notified when workflows need your approval",
        defaultChecked: true,
      },
      {
        id: "grade-updates",
        label: "Grade Updates",
        description: "Receive alerts about grade changes and summaries",
        defaultChecked: true,
      },
      {
        id: "new-submissions",
        label: "New Submissions",
        description: "Alert when students submit assignments",
        defaultChecked: false,
      },
    ],
  },
  {
    title: "Push Notifications",
    items: [
      {
        id: "urgent-workflows",
        label: "Urgent Workflows",
        description: "Immediate alerts for time-sensitive actions",
        defaultChecked: true,
      },
      {
        id: "daily-summary",
        label: "Daily Summary",
        description: "Morning digest of course activity",
        defaultChecked: false,
      },
    ],
  },
];

function buildDefaultSettings(): NotificationSettings {
  return notificationGroups
    .flatMap((group) => group.items)
    .reduce<NotificationSettings>((settings, item) => {
      settings[item.id] = item.defaultChecked;
      return settings;
    }, {});
}

export function NotificationSettingsTab() {
  const { accessToken } = useAuth();
  const defaults = useMemo(() => buildDefaultSettings(), []);
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
          Choose how you want to be notified about course activity and workflow
          updates.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading preferences...</p>
        ) : null}

        {notificationGroups.map((group) => (
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
