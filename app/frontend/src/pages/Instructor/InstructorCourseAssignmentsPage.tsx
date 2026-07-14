import { AlertCircle, Eye, Loader2, Pencil, Users } from "lucide-react";
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
import { useInstructorCourseOutletContext } from "@/hooks/useInstructorCourseOutletContext";
import { useResolvedInstructorCourse } from "@/hooks/useResolvedInstructorCourse";
import { formatDueDateForDisplay } from "@/lib/assignment-utils";
import { formatInstructorCourseTitle } from "@/lib/format-course-title";
import {
  DEFAULT_PAGE_SIZE,
  filterBySearch,
  paginateItems,
} from "@/lib/table-pagination";
import {
  instructorAssignmentUpdatePath,
  instructorCourseStudentsPath,
  instructorCourseSubmissionsPath,
  paths,
} from "@/routes/paths";
import {
  AssignmentApiError,
  fetchCourseAssignments,
} from "@/services/assignments";
import type { Assignment } from "@/types/assignment";
import type { InstructorCourse } from "@/types/course";
import { pageEmbedded, pageShell } from "@/lib/page-shell";

export function InstructorCourseAssignmentsPage() {
  const { localCourseId } = useParams();
  const layoutContext = useInstructorCourseOutletContext();
  const embedded = layoutContext?.embedded ?? false;
  const { accessToken, user } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const parsedLocalCourseId = layoutContext?.localCourseId ?? Number(localCourseId);
  const idIsValid =
    Number.isInteger(parsedLocalCourseId) && parsedLocalCourseId > 0;

  const resolvedCourse = useResolvedInstructorCourse(
    embedded ? 0 : parsedLocalCourseId,
  );
  const {
    course,
    canvasUrl,
    isLoading: isResolvingCourse,
    loadError: courseError,
    needsCanvasConnection,
  } = embedded && layoutContext
    ? {
        course: layoutContext.course,
        canvasUrl: layoutContext.canvasUrl,
        isLoading: false,
        loadError: layoutContext.loadError,
        needsCanvasConnection: layoutContext.needsCanvasConnection,
      }
    : resolvedCourse;

  useEffect(() => {
    if (
      !accessToken ||
      !idIsValid ||
      !user?.has_canvas_token ||
      isResolvingCourse ||
      !course ||
      !canvasUrl
    ) {
      return;
    }

    const token = accessToken;
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
  }, [
    accessToken,
    canvasUrl,
    course,
    idIsValid,
    isResolvingCourse,
    parsedLocalCourseId,
    user?.has_canvas_token,
  ]);

  const filteredAssignments = useMemo(
    () =>
      filterBySearch(assignments, search, (assignment) =>
        [assignment.name, String(assignment.id)].join(" "),
      ),
    [assignments, search],
  );

  const paginated = useMemo(
    () => paginateItems(filteredAssignments, page, pageSize),
    [filteredAssignments, page, pageSize],
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handlePageSizeChange = (value: number) => {
    setPageSize(value);
    setPage(1);
  };

  if (!idIsValid) {
    return (
      <PageState
        embedded={embedded}
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

  if (!embedded && (!user?.has_canvas_token || needsCanvasConnection)) {
    return (
      <div className={pageShell}>
        <PageHeader localCourseId={parsedLocalCourseId} course={course} embedded={embedded} />
        <CanvasConnectionRequired />
      </div>
    );
  }

  if (!embedded && (isResolvingCourse || isLoading)) {
    return (
      <PageState
        embedded={embedded}
        title="Loading assignments"
        message="Fetching assignments from Canvas..."
        icon={<Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />}
      />
    );
  }

  if (!embedded && courseError) {
    return (
      <PageState
        embedded={embedded}
        title="Unable to load course"
        message={courseError}
        icon={<AlertCircle className="size-5 text-destructive" aria-hidden="true" />}
        action={
          <Button variant="outline" render={<Link to={paths.instructor.courses} />}>
            Back to courses
          </Button>
        }
      />
    );
  }

  if (!embedded && !course) {
    return (
      <PageState
        embedded={embedded}
        title="Course not found"
        message="This course is not available in your synced Canvas courses."
        action={
          <Button variant="outline" render={<Link to={paths.instructor.courses} />}>
            Back to courses
          </Button>
        }
      />
    );
  }

  if (embedded && isLoading) {
    return (
      <PageState
        embedded
        title="Loading assignments"
        message="Fetching assignments from Canvas..."
        icon={<Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />}
      />
    );
  }

  if (loadError) {
    return (
      <PageState
        embedded={embedded}
        title="Unable to load assignments"
        message={loadError}
        icon={<AlertCircle className="size-5 text-destructive" aria-hidden="true" />}
        action={
          embedded ? undefined : (
            <Button variant="outline" render={<Link to={paths.instructor.courses} />}>
              Back to courses
            </Button>
          )
        }
      />
    );
  }

  const content = (
    <>
      <PageHeader localCourseId={parsedLocalCourseId} course={course} embedded={embedded} />

      <DataTableToolbar
        search={search}
        onSearchChange={handleSearchChange}
        searchLabel="Search assignments"
        searchPlaceholder="Search by name or ID..."
      />

      {assignments.length === 0 ? (
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No assignments found for this course in Canvas.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden shadow-sm ring-1 ring-border/60">
          <CardContent className="p-0">
            {paginated.totalItems === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                No assignments match your search.
              </p>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Assignment</TableHead>
                      <TableHead>Due date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.items.map((assignment) => (
                      <TableRow key={assignment.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">
                              {assignment.name}
                              {!assignment.published ? (
                                <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700">
                                  Unpublished
                                </span>
                              ) : null}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              ID: {assignment.id}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          {formatDueDateForDisplay(assignment.due_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              render={
                                <Link
                                  to={instructorCourseSubmissionsPath(
                                    parsedLocalCourseId,
                                    assignment.id,
                                  )}
                                />
                              }
                            >
                              <Eye data-icon="inline-start" />
                              Submissions
                            </Button>
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
                          </div>
                        </TableCell>
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
      )}
    </>
  );

  return embedded ? (
    <div className={pageEmbedded}>{content}</div>
  ) : (
    <div className={pageShell}>{content}</div>
  );
}

function PageHeader({
  localCourseId,
  course,
  embedded = false,
}: {
  localCourseId: number;
  course?: InstructorCourse | null;
  embedded?: boolean;
}) {
  if (embedded) {
    return <h2 className="text-lg font-semibold">Assignments</h2>;
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Course Assignments
        </h1>
        <p className="text-muted-foreground">
          {course
            ? formatInstructorCourseTitle(course)
            : "Manage assignments and view submissions for this course."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          render={<Link to={instructorCourseStudentsPath(localCourseId)} />}
        >
          <Users data-icon="inline-start" />
          Students
        </Button>
        <Button variant="outline" render={<Link to={paths.instructor.courses} />}>
          Back to courses
        </Button>
      </div>
    </div>
  );
}

function PageState({
  title,
  message,
  icon,
  action,
  embedded = false,
}: {
  title: string;
  message: string;
  icon?: ReactNode;
  action?: ReactNode;
  embedded?: boolean;
}) {
  const card = (
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
  );

  if (embedded) {
    return card;
  }

  return (
    <div className={pageShell}>{card}</div>
  );
}
