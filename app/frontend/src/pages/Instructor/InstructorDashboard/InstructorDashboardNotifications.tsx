import { Bell, Bot, UserPlus, FileWarning } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  DashboardNotification,
  DashboardNotificationVariant,
} from "@/types/dashboard";

import { dashboardColors, dashboardInteractive } from "./dashboardColors";

interface InstructorDashboardNotificationsProps {
  notifications: DashboardNotification[];
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

export function InstructorDashboardNotifications({
  notifications,
}: InstructorDashboardNotificationsProps) {
  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="flex items-center gap-2">
            <Bell className="size-4" aria-hidden="true" />
            Notifications
          </CardTitle>
          <span className={dashboardColors.red.badge} aria-label="3 unread">
            {notifications.length}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-4">
          {notifications.map((notification) => {
            const { icon: Icon, iconClassName } =
              notificationConfig[notification.variant];

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
                  <p className="text-sm font-medium">{notification.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {notification.timestamp}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
      <CardFooter className="border-t-0 bg-transparent pt-0">
        <button
          type="button"
          className={cn(dashboardInteractive.footerButton, dashboardColors.blue.link)}
        >
          View All Notifications
        </button>
      </CardFooter>
    </Card>
  );
}
