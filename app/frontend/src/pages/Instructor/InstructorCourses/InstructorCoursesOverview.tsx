import {
  BookOpen,
  ClipboardList,
  LineChart,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { InstructorCourse } from "@/types/course";

interface InstructorCoursesOverviewProps {
  courses: InstructorCourse[];
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
  courses,
}: InstructorCoursesOverviewProps) {
  const totalStudents = courses.reduce(
    (sum, course) => sum + course.studentCount,
    0,
  );
  const totalAssignments = courses.reduce(
    (sum, course) => sum + course.assignmentCount,
    0,
  );
  const averageStudents = courses.length
    ? Math.round(totalStudents / courses.length)
    : 0;

  return (
    <section aria-labelledby="course-analytics-heading" className="space-y-4">
      <h2 id="course-analytics-heading" className="text-lg font-semibold">
        Course Analytics Overview
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewCard
          title="Total Courses"
          value={String(courses.length)}
          detail="Synced from Canvas"
          icon={BookOpen}
          detailClassName="text-muted-foreground"
        />
        <OverviewCard
          title="Total Students"
          value={String(totalStudents)}
          detail="Across all courses"
          icon={Users}
          detailClassName="text-muted-foreground"
        />
        <OverviewCard
          title="Total Assignments"
          value={String(totalAssignments)}
          detail="Across all courses"
          icon={ClipboardList}
          detailClassName="text-muted-foreground"
        />
        <OverviewCard
          title="Avg. Students / Course"
          value={String(averageStudents)}
          detail="From Canvas enrollment counts"
          icon={LineChart}
          detailClassName="text-muted-foreground"
        />
      </div>
    </section>
  );
}
