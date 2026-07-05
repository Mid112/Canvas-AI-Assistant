import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
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
import { getMockCourseStudents } from "@/data/mockStudents";
import { getPrimaryCanvasConnectionUrl } from "@/lib/canvas-connections";
import {
  DEFAULT_PAGE_SIZE,
  filterBySearch,
  paginateItems,
} from "@/lib/table-pagination";
import {
  instructorCourseAssignmentsPath,
  paths,
} from "@/routes/paths";
import { fetchCourseStudents, StudentApiError } from "@/services/students";
import type { CourseStudent } from "@/types/student";

export function InstructorCourseStudentsPage() {
  const { localCourseId } = useParams();
  const { accessToken, user } = useAuth();
  const [students, setStudents] = useState<CourseStudent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [usingSampleData, setUsingSampleData] = useState(false);
  const canvasUrl = getPrimaryCanvasConnectionUrl(user);

  const parsedLocalCourseId = Number(localCourseId);
  const idIsValid =
    Number.isInteger(parsedLocalCourseId) && parsedLocalCourseId > 0;

  useEffect(() => {
    if (!idIsValid) {
      return;
    }

    if (!user?.has_canvas_token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- load mock roster when Canvas is not connected
      setStudents(getMockCourseStudents(parsedLocalCourseId));
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

    async function loadStudents() {
      try {
        const data = await fetchCourseStudents(
          parsedLocalCourseId,
          token,
          selectedCanvasUrl,
        );
        if (!cancelled) {
          setStudents(data);
          setUsingSampleData(false);
          setLoadError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof StudentApiError
              ? error.message
              : "Unable to load students.";
          setLoadError(message);
          setStudents([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    setIsLoading(true);
    void loadStudents();

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    canvasUrl,
    idIsValid,
    parsedLocalCourseId,
    user?.has_canvas_token,
  ]);

  const filteredStudents = useMemo(() => {
    const searched = filterBySearch(students, search, (student) =>
      [student.name, student.login_id ?? "", student.sortable_name ?? ""].join(
        " ",
      ),
    );

    if (statusFilter === "all") {
      return searched;
    }

    return searched.filter(
      (student) => student.enrollment_state === statusFilter,
    );
  }, [search, statusFilter, students]);

  const paginated = useMemo(
    () => paginateItems(filteredStudents, page, pageSize),
    [filteredStudents, page, pageSize],
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handlePageSizeChange = (value: number) => {
    setPageSize(value);
    setPage(1);
  };

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

  if (!user?.has_canvas_token && students.length === 0 && !isLoading) {
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
        title="Loading students"
        message="Fetching enrolled students..."
        icon={<Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />}
      />
    );
  }

  if (loadError) {
    return (
      <PageState
        title="Unable to load students"
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

      {usingSampleData ? (
        <p
          role="status"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950"
        >
          Showing sample student data for local development.
        </p>
      ) : null}

      <DataTableToolbar
        search={search}
        onSearchChange={handleSearchChange}
        searchLabel="Search students"
        searchPlaceholder="Search by name or email..."
        filterValue={statusFilter}
        onFilterChange={handleStatusFilterChange}
        filterLabel="Enrollment status"
        filterOptions={[
          { value: "all", label: "All enrollments" },
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
        ]}
      />

      <Card className="overflow-hidden shadow-sm ring-1 ring-border/60">
        <CardContent className="p-0">
          {paginated.totalItems === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No students match your filters.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Login ID</TableHead>
                    <TableHead>Enrollment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.items.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">{student.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {student.login_id ?? "—"}
                      </TableCell>
                      <TableCell className="capitalize">
                        {student.enrollment_state}
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
    </div>
  );
}

function PageHeader({ localCourseId }: { localCourseId: number }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Course Students
        </h1>
        <p className="text-muted-foreground">
          Enrolled students for course #{localCourseId}.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          render={<Link to={instructorCourseAssignmentsPath(localCourseId)} />}
        >
          Assignments
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
