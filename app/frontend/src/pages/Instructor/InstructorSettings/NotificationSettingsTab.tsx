import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

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

export function NotificationSettingsTab() {
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const handleSave = () => {
    setSavedMessage("Notification preferences saved.");
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
                    defaultChecked={item.defaultChecked}
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

        <Button type="button" onClick={handleSave}>
          Save Preferences
        </Button>
      </CardContent>
    </Card>
  );
}
