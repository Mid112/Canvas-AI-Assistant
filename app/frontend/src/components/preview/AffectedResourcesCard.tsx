import { Users } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInitials } from "@/lib/user-display";
import type { DryRunAffectedResources } from "@/types/dryRunPreview";

interface AffectedResourcesCardProps {
  resources: DryRunAffectedResources;
}

function getStudentCount(
  students: DryRunAffectedResources["students"],
): number {
  if (!students) {
    return 0;
  }

  return Array.isArray(students) ? students.length : students.count;
}

export function AffectedResourcesCard({ resources }: AffectedResourcesCardProps) {
  const studentCount = getStudentCount(resources.students);
  const sectionCount = resources.sections?.count ?? 0;

  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Users className="size-4 text-orange-500" aria-hidden="true" />
          Affected Entities
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 pt-0">
        <div className="grid gap-3 sm:grid-cols-3">
          {resources.course ? (
            <div className="rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-primary">1</p>
              <p className="text-sm font-medium text-primary">Course</p>
            </div>
          ) : null}
          {resources.assignment ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-emerald-700">1</p>
              <p className="text-sm font-medium text-emerald-800">Assignment</p>
            </div>
          ) : null}
          {studentCount > 0 ? (
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-orange-700">{studentCount}</p>
              <p className="text-sm font-medium text-orange-800">
                Student{studentCount === 1 ? "" : "s"}
              </p>
            </div>
          ) : null}
        </div>

        {resources.course ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Course
            </p>
            <p className="text-sm font-semibold text-foreground">{resources.course.name}</p>
            <p className="text-xs text-muted-foreground">Course ID: {resources.course.id}</p>
          </div>
        ) : null}

        {resources.assignment ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Assignment
            </p>
            <p className="text-sm font-semibold text-foreground">
              {resources.assignment.name}
            </p>
            <p className="text-xs text-muted-foreground">
              Assignment ID: {resources.assignment.id}
              {resources.assignment.dueDate
                ? ` • Due: ${resources.assignment.dueDate}`
                : ""}
            </p>
          </div>
        ) : null}

        {sectionCount > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sections
            </p>
            <p className="text-sm font-semibold text-foreground">
              {sectionCount} Section{sectionCount === 1 ? "" : "s"}
            </p>
          </div>
        ) : null}

        {resources.students && Array.isArray(resources.students) ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Students
            </p>
            <ul className="space-y-2">
              {resources.students.map((student) => (
                <li
                  key={student.id}
                  className="flex items-center gap-3 rounded-lg border bg-muted/20 px-3 py-2"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                    {getInitials(student.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {student.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{student.email}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {resources.students && !Array.isArray(resources.students) ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Students
            </p>
            <p className="text-sm font-semibold text-foreground">
              {resources.students.count} Student{resources.students.count === 1 ? "" : "s"}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
