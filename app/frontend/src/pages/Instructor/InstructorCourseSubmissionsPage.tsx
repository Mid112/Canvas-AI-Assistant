import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { DataTableToolbar } from "@/components/common/DataTableToolbar";
import { TablePagination } from "@/components/common/TablePagination";
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
import { formatDueDateForDisplay } from "@/lib/assignment-utils";
import { getPrimaryCanvasConnectionUrl } from "@/lib/canvas-connections";
import {
  getMockAssignmentSubmissions,
  mockAssignmentName,
} from "@/data/mockSubmissions";
import {
  DEFAULT_PAGE_SIZE,
  filterBySearch,
  paginateItems,
} from "@/lib/table-pagination";
import {
  instructorCourseAssignmentsPath,
  paths,
} from "@/routes/paths";
import { fetchAssignment, AssignmentApiError } from "@/services/assignments";
import {
  fetchAssignmentSubmissions,
  SubmissionApiError,
} from "@/services/submissions";
import type { ApiSubmission, ApiSubmissionStatusFilter } from "@/types/submission";

function formatSubmittedAt(value: string | null): string {
  if (!value) {
    return "—";
  }

  return formatDueDateForDisplay(value);
}

export function InstructorCourseSubmissionsPage() {
  const { localCourseId, assignmentId } = useParams();
  const { accessToken, user } = useAuth();
  const [submissions, setSubmissions] = useState<ApiSubmission[]>([]);
  const [assignmentName, setAssignmentName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<ApiSubmissionStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [usingSampleData, setUsingSampleData] = useState(false);
  const canvasUrl = getPrimaryCanvasConnectionUrl(user);

  const parsedLocalCourseId = Number(localCourseId);
  const parsedAssignmentId = Number(assignmentId);
  const idsAreValid =
    Number.isInteger(parsedLocalCourseId) &&
    parsedLocalCourseId > 0 &&
    Number.isInteger(parsedAssignmentId) &&
    parsedAssignmentId > 0;

  useEffect(() => {
    if (!idsAreValid) {
      return;
    }

    if (!user?.has_canvas_token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- load mock submissions when Canvas is not connected
      setSubmissions(getMockAssignmentSubmissions(parsedAssignmentId));
      setAssignmentName(mockAssignmentName);
      setUsingSampleData(true);
      setIsLoading(false);
      return;
    }

    if (!accessToken) {
      return;
    }

    const token = accessToken;
    const selectedCanvasUrl = canvasUrl;
    let cancelled = false;

    async function loadSubmissions() {
      try {
        const [assignment, data] = await Promise.all([
          fetchAssignment(
            parsedLocalCourseId,
            parsedAssignmentId,
            token,
            selectedCanvasUrl,
          ),
          fetchAssignmentSubmissions(
            parsedLocalCourseId,
            parsedAssignmentId,
            token,
            selectedCanvasUrl,
          ),
        ]);

        if (!cancelled) {
          setAssignmentName(assignment.name);
          setSubmissions(data);
          setUsingSampleData(false);
          setLoadError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof SubmissionApiError || error instanceof AssignmentApiError
              ? error.message
              : "Unable to load submissions.";
          setLoadError(message);
          setSubmissions([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    setIsLoading(true);
    void loadSubmissions();

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    canvasUrl,
    idsAreValid,
    parsedAssignmentId,
    parsedLocalCourseId,
    user?.has_canvas_token,
  ]);

  const filteredSubmissions = useMemo(() => {
    const searched = filterBySearch(submissions, search, (submission) =>
      [submission.student_name ?? "", String(submission.user_id), submission.status].join(
        " ",
      ),
    );

    if (statusFilter === "all") {
      return searched;
    }

    return searched.filter((submission) => submission.status === statusFilter);
  }, [search, statusFilter, submissions]);

  const paginated = useMemo(
    () => paginateItems(filteredSubmissions, page, pageSize),
    [filteredSubmissions, page, pageSize],
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value as ApiSubmissionStatusFilter);
    setPage(1);
  };

  const handlePageSizeChange = (value: number) => {
    setPageSize(value);
    setPage(1);
  };

  if (!idsAreValid) {
    return (
      <PageState
        title="Invalid assignment link"
        message="The course or assignment ID in this URL is not valid."
        action={
          <Button variant="outline" render={<Link to={paths.instructor.courses} />}>
            Back to courses
          </Button>
        }
      />
    );
  }

  if (!user?.has_canvas_token && submissions.length === 0 && !isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <PageHeader
          localCourseId={parsedLocalCourseId}
          assignmentId={parsedAssignmentId}
          assignmentName={assignmentName}
        />
        <CanvasConnectionRequired />
      </div>
    );
  }

  if (isLoading) {
    return (
      <PageState
        title="Loading submissions"
        message="Fetching submissions from Canvas..."
        icon={<Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />}
      />
    );
  }

  if (loadError) {
    return (
      <PageState
        title="Unable to load submissions"
        message={loadError}
        icon={<AlertCircle className="size-5 text-destructive" aria-hidden="true" />}
        action={
          <Button
            variant="outline"
            render={
              <Link to={instructorCourseAssignmentsPath(parsedLocalCourseId)} />
            }
          >
            Back to assignments
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <PageHeader
        localCourseId={parsedLocalCourseId}
        assignmentId={parsedAssignmentId}
        assignmentName={assignmentName}
      />

      {usingSampleData ? (
        <p
          role="status"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950"
        >
          Showing sample submission data for local development.
        </p>
      ) : null}

      <DataTableToolbar
        search={search}
        onSearchChange={handleSearchChange}
        searchLabel="Search submissions"
        searchPlaceholder="Search by student or status..."
        filterValue={statusFilter}
        onFilterChange={handleStatusFilterChange}
        filterLabel="Submission status"
        filterOptions={[
          { value: "all", label: "All statuses" },
          { value: "graded", label: "Graded" },
          { value: "submitted", label: "Submitted" },
          { value: "late", label: "Late" },
          { value: "missing", label: "Missing" },
          { value: "unsubmitted", label: "Unsubmitted" },
          { value: "excused", label: "Excused" },
        ]}
      />

      <Card className="overflow-hidden shadow-sm ring-1 ring-border/60">
        <CardContent className="p-0">
          {paginated.totalItems === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No submissions match your filters.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Grade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.items.map((submission) => (
                    <TableRow key={submission.id}>
                      <TableCell className="font-medium">
                        {submission.student_name ?? `User ${submission.user_id}`}
                      </TableCell>
                      <TableCell className="capitalize">{submission.status}</TableCell>
                      <TableCell>{formatSubmittedAt(submission.submitted_at)}</TableCell>
                      <TableCell>
                        {submission.score != null ? submission.score : "—"}
                      </TableCell>
                      <TableCell>{submission.grade ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination
                page={paginated.page}
                totalPages={paginated.totalPages}
                totalItems={paginated.totalItems}
                pageSize={paginated.pageSize}
                onPageChange={setPage}
                onPageSizeChange={handlePageSizeChange}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PageHeader({
  localCourseId,
  assignmentId,
  assignmentName,
}: {
  localCourseId: number;
  assignmentId: number;
  assignmentName: string | null;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Assignment Submissions
        </h1>
        <p className="text-muted-foreground">
          {assignmentName
            ? `${assignmentName} (ID ${assignmentId})`
            : `Submissions for assignment #${assignmentId}`}
        </p>
      </div>
      <Button
        variant="outline"
        render={<Link to={instructorCourseAssignmentsPath(localCourseId)} />}
      >
        Back to assignments
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
