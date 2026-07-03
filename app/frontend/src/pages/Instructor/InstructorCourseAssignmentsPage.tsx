import { AlertCircle, Loader2, Pencil } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useCanvasConnectionUrl } from "@/hooks/useCanvasConnectionUrl";
import { formatDueDateForDisplay } from "@/lib/assignment-utils";
import {
  instructorAssignmentUpdatePath,
  paths,
} from "@/routes/paths";
import {
  AssignmentApiError,
  fetchCourseAssignments,
} from "@/services/assignments";
import type { Assignment } from "@/types/assignment";

export function InstructorCourseAssignmentsPage() {
  const { localCourseId } = useParams();
  const { accessToken, user } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const canvasUrl = useCanvasConnectionUrl();

  const parsedLocalCourseId = Number(localCourseId);
  const idIsValid =
    Number.isInteger(parsedLocalCourseId) && parsedLocalCourseId > 0;

  useEffect(() => {
    if (!accessToken || !idIsValid || !user?.has_canvas_token) {
      return;
    }

    const token = accessToken;
    // Snapshot the URL used for this request so an auth/user refresh during the
    // async load cannot switch Canvas hosts mid-flight.
    const selectedCanvasUrl = canvasUrl;
    let cancelled = false;

    async function loadAssignments() {
      try {
        const data = await fetchCourseAssignments(
          parsedLocalCourseId,
          token,
          selectedCanvasUrl,
        );
        if (!cancelled) {
          setAssignments(data);
          setLoadError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof AssignmentApiError
              ? error.message
              : "Unable to load assignments.";
          setLoadError(message);
          setAssignments([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- async data load
    setIsLoading(true);
    void loadAssignments();

    return () => {
      cancelled = true;
    };
  }, [accessToken, canvasUrl, idIsValid, parsedLocalCourseId, user?.has_canvas_token]);

  if (!idIsValid) {
    return (
      <PageState
        title="Invalid course link"
        message="The course ID in this URL is not valid."
        action={
          <Button variant="outline" render={<Link to={paths.instructor.courses} />}>
            Back to courses
          </Button>
        }
      />
    );
  }

  if (!user?.has_canvas_token) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <PageHeader localCourseId={parsedLocalCourseId} />
        <CanvasConnectionRequired />
      </div>
    );
  }

  if (isLoading) {
    return (
      <PageState
        title="Loading assignments"
        message="Fetching assignments from Canvas..."
        icon={<Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />}
      />
    );
  }

  if (loadError) {
    return (
      <PageState
        title="Unable to load assignments"
        message={loadError}
        icon={<AlertCircle className="size-5 text-destructive" aria-hidden="true" />}
        action={
          <Button variant="outline" render={<Link to={paths.instructor.courses} />}>
            Back to courses
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader localCourseId={parsedLocalCourseId} />

      {assignments.length === 0 ? (
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No assignments found for this course in Canvas.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden shadow-sm ring-1 ring-border/60">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assignment</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((assignment) => (
                  <TableRow key={assignment.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium">{assignment.name}</p>
                        <p className="text-xs text-muted-foreground">
                          ID: {assignment.id}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatDueDateForDisplay(assignment.due_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        render={
                          <Link
                            to={instructorAssignmentUpdatePath(
                              parsedLocalCourseId,
                              assignment.id,
                            )}
                          />
                        }
                      >
                        <Pencil data-icon="inline-start" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PageHeader({ localCourseId }: { localCourseId: number }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Course Assignments
        </h1>
        <p className="text-muted-foreground">
          Select an assignment to update details for course #{localCourseId}.
        </p>
      </div>
      <Button variant="outline" render={<Link to={paths.instructor.courses} />}>
        Back to courses
      </Button>
    </div>
  );
}

function PageState({
  title,
  message,
  icon,
  action,
}: {
  title: string;
  message: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <Card className="max-w-2xl shadow-sm ring-1 ring-border/60">
        <CardContent className="flex flex-col items-start gap-4 p-6">
          <div className="flex items-center gap-3">
            {icon}
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">{title}</h1>
              <p className="text-sm text-muted-foreground">{message}</p>
            </div>
          </div>
          {action}
        </CardContent>
      </Card>
    </div>
  );
}
