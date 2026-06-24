import {
  AlertCircle,
  ClipboardList,
  LineChart,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatAnalyticsTrend,
  getTrendColorClass,
  getTrendDirection,
} from "@/lib/analytics-trends";
import { cn } from "@/lib/utils";
import type { CourseAnalyticsOverview } from "@/types/course";

interface InstructorCoursesOverviewProps {
  analytics: CourseAnalyticsOverview;
}

function OverviewCard({
  title,
  value,
  detail,
  icon: Icon,
  detailClassName,
}: {
  title: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  detailClassName?: string;
}) {
  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="size-4 text-primary" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className={cn("text-sm tabular-nums", detailClassName)}>{detail}</p>
      </CardContent>
    </Card>
  );
}

export function InstructorCoursesOverview({
  analytics,
}: InstructorCoursesOverviewProps) {
  const activePercent = analytics.totalStudents
    ? Math.round((analytics.activeStudents / analytics.totalStudents) * 100)
    : 0;

  return (
    <section aria-labelledby="course-analytics-heading" className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 id="course-analytics-heading" className="text-lg font-semibold">
          Course Analytics Overview
        </h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewCard
          title="Average Performance"
          value={`${analytics.averagePerformance}%`}
          detail={formatAnalyticsTrend(analytics.averagePerformanceTrend)}
          icon={LineChart}
          detailClassName={getTrendColorClass(
            getTrendDirection(analytics.averagePerformanceTrend),
          )}
        />
        <OverviewCard
          title="Active Students"
          value={`${analytics.activeStudents}/${analytics.totalStudents}`}
          detail={`${activePercent}%`}
          icon={Users}
          detailClassName="text-muted-foreground"
        />
        <OverviewCard
          title="Completed Assignments"
          value={`${analytics.completedAssignments}%`}
          detail={formatAnalyticsTrend(analytics.completedAssignmentsTrend)}
          icon={ClipboardList}
          detailClassName={getTrendColorClass(
            getTrendDirection(analytics.completedAssignmentsTrend),
          )}
        />
        <OverviewCard
          title="At-Risk Students"
          value={String(analytics.atRiskStudents)}
          detail={formatAnalyticsTrend(analytics.atRiskStudentsTrend)}
          icon={AlertCircle}
          detailClassName={getTrendColorClass(
            getTrendDirection(analytics.atRiskStudentsTrend, true),
          )}
        />
      </div>
    </section>
  );
}
