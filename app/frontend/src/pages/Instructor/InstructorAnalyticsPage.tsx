import { useCallback, useMemo, useState } from "react";
import { Navigate, useParams, useSearchParams } from "react-router-dom";

import { useInstitution } from "@/contexts/useInstitution";
import { getInstitutionSubmissionsData } from "@/data/institutionSubmissionsData";
import type { SubmissionStatusFilter } from "@/types/submission";
import { paths } from "@/routes/paths";

import { InstructorSubmissionsAnalysisFilters } from "./InstructorSubmissionsAnalysis/InstructorSubmissionsAnalysisFilters";
import { InstructorSubmissionsAnalysisHeader } from "./InstructorSubmissionsAnalysis/InstructorSubmissionsAnalysisHeader";
import { LateSubmissionsSection } from "./InstructorSubmissionsAnalysis/LateSubmissionsSection";
import { MissingSubmissionsSection } from "./InstructorSubmissionsAnalysis/MissingSubmissionsSection";
import { SubmissionsAiSummary } from "./InstructorSubmissionsAnalysis/SubmissionsAiSummary";
import { downloadSubmissionsReport } from "./InstructorSubmissionsAnalysis/submissionExport";
import {
  getCourseAssignments,
  parseSubmissionStatusFilter,
  resolveEffectiveAssignmentId,
  usesSampleSubmissionData,
} from "./InstructorSubmissionsAnalysis/submissionNavigation";
import {
  filterSubmissionStudents,
  shouldShowLateSection,
  shouldShowMissingSection,
} from "./InstructorSubmissionsAnalysis/submissionUtils";

export function InstructorAnalyticsPage() {
  const { courseId: courseIdParam } = useParams();
  const courseId = Number(courseIdParam);
  const { courses, selectedInstitution } = useInstitution();
  const [searchParams] = useSearchParams();
  const assignmentIdParam = searchParams.get("assignmentId");
  const statusParam = parseSubmissionStatusFilter(searchParams.get("status"));
  const course = useMemo(
    () => courses.find((entry) => entry.id === courseId),
    [courseId, courses],
  );
  const allAssignments = useMemo(() => {
    if (!course) {
      return [];
    }

    const submissionsData = getInstitutionSubmissionsData(
      selectedInstitution.id,
    );
    return getCourseAssignments(submissionsData?.assignments ?? [], course);
  }, [course, selectedInstitution.id]);
  const showingSampleSubmissionData = usesSampleSubmissionData(
    allAssignments,
    courseId,
  );
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<SubmissionStatusFilter>(statusParam);

  const effectiveAssignmentId = resolveEffectiveAssignmentId(
    allAssignments,
    selectedAssignmentId,
    assignmentIdParam,
  );

  const selectedAssignment = useMemo(() => {
    return allAssignments.find(
      (assignment) => assignment.id === effectiveAssignmentId,
    );
  }, [allAssignments, effectiveAssignmentId]);

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

  if (!course) {
    return <Navigate to={paths.instructor.courses} replace />;
  }

  if (allAssignments.length === 0) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <InstructorSubmissionsAnalysisHeader
          course={course}
          onExportReport={handleExportReport}
        />
        <p className="text-muted-foreground">
          No submission data available for {course.code}: {course.name}.
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

      {showingSampleSubmissionData ? (
        <p
          role="status"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
        >
          Showing sample submission data for local development.
        </p>
      ) : null}

      <InstructorSubmissionsAnalysisFilters
        assignments={allAssignments}
        selectedAssignmentId={effectiveAssignmentId}
        onAssignmentChange={setSelectedAssignmentId}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
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
