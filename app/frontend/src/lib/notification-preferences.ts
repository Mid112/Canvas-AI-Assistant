// Frontend helper note: centralizes notification preferences behavior so components and tests share one implementation.

import type { NotificationSettings } from "@/types/auth";

/** Shared in-app notification preference definitions.
 * IDs match `DashboardNotification.id` values from map-dashboard so Settings
 * toggles and the Notifications page stay aligned.
 */
export interface NotificationPreference {
  id: keyof NotificationSettings | string;
  label: string;
  description: string;
  defaultChecked: boolean;
}

export const NOTIFICATION_PREFERENCE_GROUPS: {
  title: string;
  items: NotificationPreference[];
}[] = [
  {
    title: "In-app notifications",
    items: [
      {
        id: "workflow-approvals",
        label: "Workflow Approvals",
        description:
          "Show alerts on the Notifications page when workflows need your approval.",
        defaultChecked: true,
      },
      {
        id: "grade-updates",
        label: "Grade Updates",
        description:
          "Show alerts when recent grade or feedback workflows have completed.",
        defaultChecked: true,
      },
      {
        id: "new-submissions",
        label: "New Submissions",
        description:
          "Show alerts when students have missing submissions that need attention.",
        defaultChecked: true,
      },
      {
        id: "urgent-workflows",
        label: "Urgent Workflows",
        description:
          "Show time-sensitive alerts for late submissions that need follow-up.",
        defaultChecked: true,
      },
      {
        id: "daily-summary",
        label: "Daily Summary",
        description:
          "Show a course activity digest (courses, students, and assignments).",
        defaultChecked: false,
      },
    ],
  },
];

export function buildDefaultNotificationSettings(): NotificationSettings {
  return NOTIFICATION_PREFERENCE_GROUPS.flatMap((group) => group.items).reduce<
    NotificationSettings
  >((settings, item) => {
    settings[item.id] = item.defaultChecked;
    return settings;
  }, {});
}

export function notificationPreferenceLabel(id: string): string | undefined {
  for (const group of NOTIFICATION_PREFERENCE_GROUPS) {
    const match = group.items.find((item) => item.id === id);
    if (match) {
      return match.label;
    }
  }
  return undefined;
}
