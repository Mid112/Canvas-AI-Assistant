// Instructor page note: coordinates instructor notifications page UI state with Canvas-backed services and active-course context.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { useAuth } from "@/contexts/AuthContext";
import { useInstitution } from "@/contexts/useInstitution";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { filterNotificationsBySettings } from "@/lib/filter-notifications";
import { pageShell } from "@/lib/page-shell";
import { NotificationList } from "@/pages/Instructor/InstructorDashboard/NotificationList";
import { instructorSettingsPath } from "@/routes/paths";
import { fetchNotificationSettings } from "@/services/auth";
import type { NotificationSettings } from "@/types/auth";

export function InstructorNotificationsPage() {
  const { user, accessToken } = useAuth();
  const { selectedInstitution, dashboard } = useInstitution();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);

  useEffect(() => {
    if (!accessToken || !user?.has_canvas_token) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const remote = await fetchNotificationSettings(accessToken);
        if (!cancelled) {
          setSettings(remote);
        }
      } catch {
        // Keep default-filtered dashboard notifications if settings fail to load.
        if (!cancelled) {
          setSettings(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, user?.has_canvas_token]);

  const notifications = useMemo(
    () => filterNotificationsBySettings(dashboard.notifications, settings),
    [dashboard.notifications, settings],
  );

  if (!user?.has_canvas_token) {
    return (
      <div className={pageShell}>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Notifications
          </h1>
          <p className="text-muted-foreground">
            Updates for {user?.name ?? "Instructor"} at{" "}
            {selectedInstitution.shortName}.
          </p>
        </div>
        <CanvasConnectionRequired description="Connect Canvas to receive course and submission notifications." />
      </div>
    );
  }

  return (
    <div className={pageShell}>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Notifications
        </h1>
        <p className="text-muted-foreground">
          Updates for {user?.name ?? "Instructor"} at{" "}
          {selectedInstitution.shortName}.{" "}
          <Link
            to={instructorSettingsPath("notifications")}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Manage notification preferences
          </Link>
        </p>
      </div>

      <Card className="shadow-sm ring-1 ring-border/60">
        <CardHeader>
          <CardTitle>Recent notifications</CardTitle>
          <p className="text-sm text-muted-foreground">
            Alerts match your Settings preferences: Workflow Approvals, Grade
            Updates, New Submissions, Urgent Workflows, and Daily Summary.
          </p>
        </CardHeader>
        <CardContent>
          <NotificationList notifications={notifications} />
        </CardContent>
      </Card>
    </div>
  );
}
