import {
  BookOpen,
  CheckSquare,
  FileWarning,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAnalyticsTrend } from "@/lib/analytics-trends";
import { cn } from "@/lib/utils";
import type { DashboardMetrics } from "@/types/dashboard";

import {
  dashboardColors,
  formatMissingSubmissionsTrend,
  getMissingSubmissionsTrendClass,
} from "./dashboardColors";

interface InstructorDashboardOverviewProps {
  metrics: DashboardMetrics;
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  iconClassName,
  detailClassName,
}: {
  title: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  iconClassName: string;
  detailClassName?: string;
}) {
  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div
          className={cn(
            "flex size-8 items-center justify-center",
            iconClassName,
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {detail ? (
          <p className={cn("text-sm tabular-nums", detailClassName)}>{detail}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function InstructorDashboardOverview({
  metrics,
}: InstructorDashboardOverviewProps) {
  return (
    <section aria-labelledby="dashboard-metrics-heading">
      <h2 id="dashboard-metrics-heading" className="sr-only">
        Dashboard metrics
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Active Courses"
          value={String(metrics.activeCourses)}
          detail={formatAnalyticsTrend(metrics.activeCoursesTrend)}
          icon={BookOpen}
          iconClassName={dashboardColors.blue.iconSquare}
          detailClassName={dashboardColors.green.trend}
        />
        <MetricCard
          title="Total Students"
          value={String(metrics.totalStudents)}
          detail={formatAnalyticsTrend(metrics.totalStudentsTrend)}
          icon={Users}
          iconClassName={dashboardColors.green.iconSquare}
          detailClassName={dashboardColors.green.trend}
        />
        <MetricCard
          title="Missing Submissions"
          value={String(metrics.missingSubmissions)}
          detail={formatMissingSubmissionsTrend(metrics.missingSubmissionsTrend)}
          icon={FileWarning}
          iconClassName={dashboardColors.orange.iconSquare}
          detailClassName={getMissingSubmissionsTrendClass(
            metrics.missingSubmissionsTrend,
          )}
        />
        <MetricCard
          title="Pending Approvals"
          value={String(metrics.pendingApprovals)}
          icon={CheckSquare}
          iconClassName={dashboardColors.purple.iconSquare}
        />
      </div>
    </section>
  );
}
