import { FileText, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { paths } from "@/routes/paths";
import { fetchAdminDashboard } from "@/services/adminDashboard";

export function AdminDashboardPage() {
  const { accessToken } = useAuth();
  const [stats, setStats] = useState({
    instructor_count: 0,
    admin_count: 0,
    active_workflows: 0,
    audit_events_last_7_days: 0,
  });
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const data = await fetchAdminDashboard(accessToken);
        if (!cancelled) {
          setStats(data);
          setLoadError(null);
        }
      } catch {
        if (!cancelled) {
          setLoadError("Unable to load admin dashboard metrics.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const metrics = [
    { label: "Total instructors", value: String(stats.instructor_count) },
    { label: "Administrators", value: String(stats.admin_count) },
    { label: "Pending workflows", value: String(stats.active_workflows) },
    {
      label: "Audit events (7 days)",
      value: String(stats.audit_events_last_7_days),
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Admin Dashboard
        </h1>
        <p className="text-muted-foreground">
          System-wide overview of users, workflow activity, and audit events.
        </p>
      </header>

      {loadError ? (
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="shadow-sm ring-1 ring-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {metric.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{metric.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link
              to={paths.admin.users}
              className={cn(buttonVariants())}
            >
              <Users data-icon="inline-start" />
              Manage users
            </Link>
            <Link
              to={paths.admin.audit}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <FileText data-icon="inline-start" />
              View audit logs
            </Link>
          </CardContent>
        </Card>

        <Card className="shadow-sm ring-1 ring-border/60">
          <CardHeader>
            <CardTitle>System status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Canvas integrations: operational</p>
            <p>Workflow engine: operational</p>
            <p>Audit logging: collecting events</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
