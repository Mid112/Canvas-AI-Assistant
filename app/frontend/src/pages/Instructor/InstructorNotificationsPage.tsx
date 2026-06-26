import { useAuth } from "@/contexts/AuthContext";
import { useInstitution } from "@/contexts/useInstitution";
import { NotificationList } from "@/pages/Instructor/InstructorDashboard/NotificationList";
import { dashboardColors } from "@/pages/Instructor/InstructorDashboard/dashboardColors";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function InstructorNotificationsPage() {
  const { user } = useAuth();
  const { selectedInstitution, dashboard } = useInstitution();
  const notifications = dashboard.notifications;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Notifications
          </h1>
          {notifications.length > 0 ? (
            <span
              className={dashboardColors.red.badge}
              aria-label={`${notifications.length} unread`}
            >
              {notifications.length}
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground">
          Updates for {user?.name ?? "Instructor"} at{" "}
          {selectedInstitution.shortName}.
        </p>
      </div>

      <Card className="shadow-sm ring-1 ring-border/60">
        <CardHeader>
          <CardTitle>Recent notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <NotificationList notifications={notifications} />
        </CardContent>
      </Card>
    </div>
  );
}
