import { Bell, Bot, FileWarning, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { notificationPreferenceLabel } from "@/lib/notification-preferences";
import { cn } from "@/lib/utils";
import type {
  DashboardNotification,
  DashboardNotificationVariant,
} from "@/types/dashboard";

import { dashboardColors } from "./dashboardColors";

interface NotificationListProps {
  notifications: DashboardNotification[];
  className?: string;
}

const notificationConfig: Record<
  DashboardNotificationVariant,
  { icon: LucideIcon; iconClassName: string }
> = {
  warning: {
    icon: FileWarning,
    iconClassName: dashboardColors.orange.iconCircle,
  },
  success: {
    icon: Bot,
    iconClassName: dashboardColors.green.iconCircle,
  },
  info: {
    icon: UserPlus,
    iconClassName: dashboardColors.blue.iconCircle,
  },
};

export function NotificationList({
  notifications,
  className,
}: NotificationListProps) {
  if (notifications.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 py-12 text-center",
          className,
        )}
      >
        <div
          className={cn(
            "flex size-10 items-center justify-center",
            dashboardColors.blue.iconCircle,
          )}
        >
          <Bell className="size-4" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium">No notifications yet</p>
        <p className="text-sm text-muted-foreground">
          Enabled alerts for submissions, workflows, grades, and daily summaries
          will appear here when there is course activity.
        </p>
      </div>
    );
  }

  return (
    <ul className={cn("space-y-4", className)}>
      {notifications.map((notification) => {
        const { icon: Icon, iconClassName } =
          notificationConfig[notification.variant];
        const category = notificationPreferenceLabel(notification.id);

        return (
          <li key={notification.id} className="flex gap-3">
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center",
                iconClassName,
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-0.5">
              {category ? (
                <p className="text-xs font-medium text-muted-foreground">
                  {category}
                </p>
              ) : null}
              <p className="text-sm font-medium">{notification.message}</p>
              <p className="text-xs text-muted-foreground">
                {notification.timestamp}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
