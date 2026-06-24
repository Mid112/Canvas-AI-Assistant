import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useInstitution } from "@/contexts/useInstitution";
import { getInstitutionSubmissionsData } from "@/data/institutionSubmissionsData";
import type { SubmissionStatusFilter } from "@/types/submission";

import { InstructorSubmissionsAnalysisFilters } from "./InstructorSubmissionsAnalysis/InstructorSubmissionsAnalysisFilters";
import { InstructorSubmissionsAnalysisHeader } from "./InstructorSubmissionsAnalysis/InstructorSubmissionsAnalysisHeader";
import { LateSubmissionsSection } from "./InstructorSubmissionsAnalysis/LateSubmissionsSection";
import { MissingSubmissionsSection } from "./InstructorSubmissionsAnalysis/MissingSubmissionsSection";
import { SubmissionsAiSummary } from "./InstructorSubmissionsAnalysis/SubmissionsAiSummary";
import { downloadSubmissionsReport } from "./InstructorSubmissionsAnalysis/submissionExport";
import {
  parseSubmissionStatusFilter,
} from "./InstructorSubmissionsAnalysis/submissionNavigation";
import {
  filterSubmissionStudents,
  shouldShowLateSection,
  shouldShowMissingSection,
} from "./InstructorSubmissionsAnalysis/submissionUtils";

export function InstructorAnalyticsPage() {
  const { selectedInstitution } = useInstitution();
  const [searchParams] = useSearchParams();
  const assignmentIdParam = searchParams.get("assignmentId");
  const statusParam = parseSubmissionStatusFilter(searchParams.get("status"));
  const submissionsData = useMemo(
    () => getInstitutionSubmissionsData(selectedInstitution.id),
    [selectedInstitution.id],
  );
  const assignments = useMemo(
    () => submissionsData?.assignments ?? [],
    [submissionsData],
  );
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<SubmissionStatusFilter>(statusParam);

  const effectiveAssignmentId =
    assignments.find(
      (assignment) =>
        assignment.id === selectedAssignmentId ||
        assignment.id === assignmentIdParam,
    )?.id ??
    assignments[0]?.id ??
    "";

  const selectedAssignment = useMemo(() => {
    return assignments.find((assignment) => assignment.id === effectiveAssignmentId);
  }, [assignments, effectiveAssignmentId]);

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

  if (!selectedAssignment) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
        <InstructorSubmissionsAnalysisHeader onExportReport={handleExportReport} />
        <p className="text-muted-foreground">
          No submission data available for {selectedInstitution.shortName}.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <InstructorSubmissionsAnalysisHeader onExportReport={handleExportReport} />

      <InstructorSubmissionsAnalysisFilters
        assignments={assignments}
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

        <SubmissionsAiSummary summary={selectedAssignment.aiSummary} />
      </div>
    </div>
  );
}
