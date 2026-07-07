import { Link } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDueDateForDisplay } from "@/lib/assignment-utils";
import { cn } from "@/lib/utils";
import { instructorCourseAssignmentsPath } from "@/routes/paths";
import type { RecentAssignmentSummary } from "@/types/courseOverview";

const STATUS_STYLES = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  upcoming: "bg-blue-50 text-blue-700 ring-blue-200",
  completed: "bg-muted text-muted-foreground ring-border",
} as const;

function formatAssignmentMeta(assignment: RecentAssignmentSummary): string {
  if (assignment.status === "completed") {
    return `Completed · ${assignment.submittedCount}/${assignment.totalStudents} submitted`;
  }

  const dueLabel = assignment.dueDate
    ? `Due ${formatDueDateForDisplay(assignment.dueDate)}`
    : "No due date";

  return `${dueLabel} · ${assignment.submittedCount}/${assignment.totalStudents} submitted`;
}

interface RecentAssignmentsCardProps {
  localCourseId: number;
  assignments: RecentAssignmentSummary[];
}

export function RecentAssignmentsCard({
  localCourseId,
  assignments,
}: RecentAssignmentsCardProps) {
  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold">Recent Assignments</CardTitle>
        <Link
          to={instructorCourseAssignmentsPath(localCourseId)}
          className="text-sm font-medium text-primary hover:underline"
        >
          View All
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No assignments synced for this course yet.
          </p>
        ) : (
          assignments.map((assignment) => (
            <div
              key={assignment.localId}
              className="flex items-start justify-between gap-3 rounded-lg border border-border/60 px-4 py-3"
            >
              <div className="min-w-0 space-y-1">
                <p className="font-medium leading-snug">{assignment.title}</p>
                <p className="text-sm text-muted-foreground">
                  {formatAssignmentMeta(assignment)}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset",
                  STATUS_STYLES[assignment.status],
                )}
              >
                {assignment.status}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
