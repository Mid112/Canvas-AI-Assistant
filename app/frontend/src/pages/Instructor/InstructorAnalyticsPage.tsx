import { Loader2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";

import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { paths } from "@/routes/paths";

import { InstructorSubmissionsAnalysisFilters } from "./InstructorSubmissionsAnalysis/InstructorSubmissionsAnalysisFilters";
import { InstructorSubmissionsAnalysisHeader } from "./InstructorSubmissionsAnalysis/InstructorSubmissionsAnalysisHeader";
import { LateSubmissionsSection } from "./InstructorSubmissionsAnalysis/LateSubmissionsSection";
import { MissingSubmissionsSection } from "./InstructorSubmissionsAnalysis/MissingSubmissionsSection";
import { SubmissionsAiSummary } from "./InstructorSubmissionsAnalysis/SubmissionsAiSummary";
import { downloadSubmissionsReport } from "./InstructorSubmissionsAnalysis/submissionExport";
import {
  parseSubmissionStatusFilter,
  resolveEffectiveAssignmentId,
} from "./InstructorSubmissionsAnalysis/submissionNavigation";
import {
  filterSubmissionStudents,
  shouldShowLateSection,
  shouldShowMissingSection,
} from "./InstructorSubmissionsAnalysis/submissionUtils";
import { useCourseSubmissionAnalytics } from "./InstructorSubmissionsAnalysis/useCourseSubmissionAnalytics";

export function InstructorAnalyticsPage() {
  const { courseId: courseIdParam } = useParams();
  const courseId = Number(courseIdParam);
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const assignmentIdParam = searchParams.get("assignmentId");
  const statusFilter = parseSubmissionStatusFilter(searchParams.get("status"));
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [search, setSearch] = useState("");

  const idIsValid = Number.isInteger(courseId) && courseId > 0;

  const {
    course,
    assignments,
    isLoading,
    isLoadingSubmissions,
    loadError,
    needsCanvasConnection,
  } = useCourseSubmissionAnalytics(
    idIsValid ? courseId : 0,
    selectedAssignmentId,
    assignmentIdParam,
  );

  const effectiveAssignmentId = resolveEffectiveAssignmentId(
    assignments,
    selectedAssignmentId,
    assignmentIdParam,
  );

  const selectedAssignment = useMemo(() => {
    return assignments.find(
      (assignment) => assignment.id === effectiveAssignmentId,
    );
  }, [assignments, effectiveAssignmentId]);

  const showSubmissionsLoading =
    isLoadingSubmissions &&
    selectedAssignment?.aiSummary.keyInsights ===
      "Loading submission insights...";

  const missingStudents = useMemo(
    () =>
      filterSubmissionStudents(
        selectedAssignment?.missingSubmissions ?? [],
        search,
      ),
    [search, selectedAssignment],
  );

  const lateStudents = useMemo(
    () =>
      filterSubmissionStudents(
        selectedAssignment?.lateSubmissions ?? [],
        search,
      ),
    [search, selectedAssignment],
  );

  const handleStatusFilterChange = useCallback(
    (status: typeof statusFilter) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);

          if (status === "all") {
            next.delete("status");
          } else {
            next.set("status", status);
          }

          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const handleExportReport = useCallback(() => {
    if (!selectedAssignment) {
      return;
    }

    downloadSubmissionsReport(
      selectedAssignment,
      missingStudents,
      lateStudents,
    );
  }, [lateStudents, missingStudents, selectedAssignment]);

  if (!idIsValid) {
    return <Navigate to={paths.instructor.courses} replace />;
  }

  if (!user?.has_canvas_token || needsCanvasConnection) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <CanvasConnectionRequired description="Connect Canvas to view assignment submission analytics for your courses." />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
            Loading course analytics from Canvas...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <Card className="max-w-2xl shadow-sm ring-1 ring-border/60">
          <CardContent className="space-y-4 p-6">
            <p role="alert" className="text-sm text-destructive">
              {loadError}
            </p>
            <Button variant="outline" render={<Link to={paths.instructor.courses} />}>
              Back to courses
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!course) {
    return <Navigate to={paths.instructor.courses} replace />;
  }

  if (assignments.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <InstructorSubmissionsAnalysisHeader
          course={course}
          onExportReport={handleExportReport}
        />
        <p className="text-muted-foreground">
          No assignments found for {course.code}: {course.name}.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <InstructorSubmissionsAnalysisHeader
        course={course}
        onExportReport={handleExportReport}
      />

      {showSubmissionsLoading ? (
        <p
          role="status"
          className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
        >
          Loading submissions for the selected assignment...
        </p>
      ) : null}

      <InstructorSubmissionsAnalysisFilters
        assignments={assignments}
        selectedAssignmentId={effectiveAssignmentId}
        onAssignmentChange={setSelectedAssignmentId}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusFilterChange}
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {shouldShowMissingSection(statusFilter) ? (
            <MissingSubmissionsSection students={missingStudents} />
          ) : null}
          {shouldShowLateSection(statusFilter) ? (
            <LateSubmissionsSection students={lateStudents} />
          ) : null}
        </div>

        {selectedAssignment ? (
          <SubmissionsAiSummary summary={selectedAssignment.aiSummary} />
        ) : null}
      </div>
    </div>
  );
}
