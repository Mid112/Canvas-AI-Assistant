import { Bell } from "lucide-react";
import { Link } from "react-router-dom";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { paths } from "@/routes/paths";

import { dashboardColors } from "./dashboardColors";

interface InstructorDashboardHeaderProps {
  userName: string;
  institutionShortName: string;
  notificationCount?: number;
}

export function InstructorDashboardHeader({
  userName,
  institutionShortName,
  notificationCount = 0,
}: InstructorDashboardHeaderProps) {
  const notificationsLabel =
    notificationCount > 0
      ? `Notifications, ${notificationCount} unread`
      : "Notifications";

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Dashboard
        </h1>
        <p className="text-muted-foreground">
          Welcome back, {userName}. Overview for {institutionShortName}.
        </p>
      </div>
      <Link
        to={paths.instructor.notifications}
        aria-label={notificationsLabel}
        className={cn(
          buttonVariants({ variant: "outline", size: "icon" }),
          "relative shrink-0",
        )}
      >
        <Bell className="size-4" aria-hidden="true" />
        {notificationCount > 0 ? (
          <span
            className={cn(
              dashboardColors.red.badge,
              "absolute -right-1.5 -top-1.5",
            )}
            aria-hidden="true"
          >
            {notificationCount > 9 ? "9+" : notificationCount}
          </span>
        ) : null}
      </Link>
    </div>
  );
}
