// Instructor page note: coordinates instructor dashboard notifications UI state with Canvas-backed services and active-course context.

import { Bell } from "lucide-react";
import { Link } from "react-router-dom";

import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { paths } from "@/routes/paths";
import type { DashboardNotification } from "@/types/dashboard";

import { NotificationList } from "./NotificationList";
import { dashboardColors, dashboardInteractive } from "./dashboardColors";

interface InstructorDashboardNotificationsProps {
  notifications: DashboardNotification[];
}

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
          {notifications.length > 0 ? (
            <span
              className={dashboardColors.red.badge}
              aria-label={`${notifications.length} unread`}
            >
              {notifications.length}
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <NotificationList notifications={notifications} />
      </CardContent>
      <CardFooter className="border-t-0 bg-transparent pt-0">
        <Link
          to={paths.instructor.notifications}
          className={cn(dashboardInteractive.footerButton, dashboardColors.blue.link)}
        >
          View All Notifications
        </Link>
      </CardFooter>
    </Card>
  );
}
