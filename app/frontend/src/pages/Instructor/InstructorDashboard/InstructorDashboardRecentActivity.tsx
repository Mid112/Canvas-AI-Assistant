import {
  ClipboardPlus,
  Megaphone,
  MessageSquare,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import type {
  DashboardActivity,
  DashboardActivityType,
} from "@/types/dashboard";

import { dashboardColors, dashboardInteractive } from "./dashboardColors";

interface InstructorDashboardRecentActivityProps {
  activities: DashboardActivity[];
}

const activityConfig: Record<
  DashboardActivityType,
  { icon: LucideIcon; iconClassName: string }
> = {
  assignment_created: {
    icon: ClipboardPlus,
    iconClassName: dashboardColors.blue.iconCircle,
  },
  grades_updated: {
    icon: TrendingUp,
    iconClassName: dashboardColors.green.iconCircle,
  },
  announcement_posted: {
    icon: Megaphone,
    iconClassName: dashboardColors.purple.iconCircle,
  },
  message_received: {
    icon: MessageSquare,
    iconClassName: dashboardColors.orange.iconCircle,
  },
};

export function InstructorDashboardRecentActivity({
  activities,
}: InstructorDashboardRecentActivityProps) {
  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-4">
          {activities.map((activity) => {
            const { icon: Icon, iconClassName } = activityConfig[activity.type];

            return (
              <li key={activity.id} className="flex gap-3">
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center",
                    iconClassName,
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">{activity.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {activity.courseLabel}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {activity.timestamp}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
      <CardFooter className="border-t-0 bg-transparent pt-0">
        <Link
          to={paths.instructor.history}
          className={cn(dashboardInteractive.footerButton, dashboardColors.blue.link)}
        >
          View All Activity
        </Link>
      </CardFooter>
    </Card>
  );
}
