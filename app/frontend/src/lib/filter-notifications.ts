import { buildDefaultNotificationSettings } from "@/lib/notification-preferences";
import type { NotificationSettings } from "@/types/auth";
import type { DashboardNotification } from "@/types/dashboard";

/**
 * Keep Notifications page items in sync with Settings toggles.
 * Preference IDs match notification IDs from map-dashboard.
 */
export function filterNotificationsBySettings(
  notifications: DashboardNotification[],
  settings: NotificationSettings | null,
): DashboardNotification[] {
  const effective = {
    ...buildDefaultNotificationSettings(),
    ...(settings ?? {}),
  };

  return notifications.filter(
    (notification) => effective[notification.id] !== false,
  );
}
