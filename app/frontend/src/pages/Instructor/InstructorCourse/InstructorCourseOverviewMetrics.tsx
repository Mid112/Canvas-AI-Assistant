import {
  CheckCircle2,
  ClipboardList,
  LineChart,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CourseOverviewData } from "@/types/courseOverview";
import type { InstructorCourse } from "@/types/course";

interface InstructorCourseOverviewMetricsProps {
  course: InstructorCourse;
  overview: CourseOverviewData | null;
}

function MetricCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
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
      </CardContent>
    </Card>
  );
}

function formatPercent(value: number | null): string {
  if (value == null) {
    return "—";
  }

  return `${Math.round(value)}%`;
}

export function InstructorCourseOverviewMetrics({
  course,
  overview,
}: InstructorCourseOverviewMetricsProps) {
  const studentCount =
    course.studentCount > 0 ? course.studentCount : (overview?.studentCount ?? 0);
  const assignmentCount =
    course.assignmentCount > 0
      ? course.assignmentCount
      : (overview?.assignmentCount ?? 0);
  const averageGrade = overview?.averageGrade ?? null;
  const completionRate = overview?.completionRate ?? null;

  return (
    <section
      aria-labelledby="course-metrics-heading"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <h2 id="course-metrics-heading" className="sr-only">
        Course metrics
      </h2>
      <MetricCard title="Total Students" value={String(studentCount)} icon={Users} />
      <MetricCard
        title="Active Assignments"
        value={String(assignmentCount)}
        icon={ClipboardList}
      />
      <MetricCard
        title="Average Grade"
        value={formatPercent(averageGrade)}
        icon={LineChart}
      />
      <MetricCard
        title="Completion Rate"
        value={formatPercent(completionRate)}
        icon={CheckCircle2}
      />
    </section>
  );
}
