// Instructor page note: coordinates student activity card UI state with Canvas-backed services and active-course context.

import { Link } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { instructorCourseAnalyticsPath } from "@/routes/paths";
import type { StudentActivityItem } from "@/types/courseOverview";

interface StudentActivityCardProps {
  localCourseId: number;
  activity: StudentActivityItem[];
}

export function StudentActivityCard({
  localCourseId,
  activity,
}: StudentActivityCardProps) {
  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Student Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Recent student activity will appear here after submissions are synced.
          </p>
        ) : (
          <ul className="space-y-4">
            {activity.map((item, index) => (
              <li key={`${item.studentName}-${item.occurredAt}-${index}`} className="flex gap-3">
                <div
                  className="mt-1 size-2 shrink-0 rounded-full bg-primary"
                  aria-hidden="true"
                />
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-medium">{item.studentName}</p>
                  <p className="text-sm text-muted-foreground">{item.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeTime(item.occurredAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link
          to={instructorCourseAnalyticsPath(localCourseId)}
          className="inline-block text-sm font-medium text-primary hover:underline"
        >
          View All Activity
        </Link>
      </CardContent>
    </Card>
  );
}
