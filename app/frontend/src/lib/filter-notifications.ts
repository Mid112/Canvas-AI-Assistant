import type { NotificationSettings } from "@/types/auth";
import type { DashboardNotification } from "@/types/dashboard";

/**
 * Apply instructor notification preferences to dashboard-derived alerts.
 *
 * Only preferences that map to an in-app alert type are applied:
 * - `workflow-approvals` → pending-workflows
 *
 * `new-submissions`, `grade-updates`, `urgent-workflows`, and `daily-summary`
 * are email/push preferences and do not mute missing/late submission alerts.
 */
export function filterNotificationsBySettings(
  notifications: DashboardNotification[],
  settings: NotificationSettings | null,
): DashboardNotification[] {
  if (!settings) {
    return notifications;
  }

  return notifications.filter((notification) => {
    if (notification.id === "pending-workflows") {
      return settings["workflow-approvals"] !== false;
    }
    return true;
  });
}
