import { Filter, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  AssignmentSubmissionAnalysis,
  SubmissionStatusFilter,
} from "@/types/submission";

interface InstructorSubmissionsAnalysisFiltersProps {
  assignments: AssignmentSubmissionAnalysis[];
  selectedAssignmentId: string;
  onAssignmentChange: (assignmentId: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: SubmissionStatusFilter;
  onStatusFilterChange: (status: SubmissionStatusFilter) => void;
}

const selectClassName = cn(
  "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
);

export function InstructorSubmissionsAnalysisFilters({
  assignments,
  selectedAssignmentId,
  onAssignmentChange,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
}: InstructorSubmissionsAnalysisFiltersProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="space-y-1.5">
        <label
          htmlFor="assignment-select"
          className="text-sm font-medium text-foreground"
        >
          Select Assignment
        </label>
        <select
          id="assignment-select"
          value={selectedAssignmentId}
          onChange={(event) => onAssignmentChange(event.target.value)}
          className={selectClassName}
        >
          {assignments.map((assignment) => (
            <option key={assignment.id} value={assignment.id}>
              {assignment.courseCode}: {assignment.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="student-search"
          className="text-sm font-medium text-foreground"
        >
          Search Students
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="student-search"
            type="search"
            placeholder="Search by name..."
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="pl-8"
            aria-label="Search students"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="status-filter"
          className="text-sm font-medium text-foreground"
        >
          Filter by Status
        </label>
        <div className="relative">
          <Filter
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(event) =>
              onStatusFilterChange(event.target.value as SubmissionStatusFilter)
            }
            className={cn(selectClassName, "pl-8")}
          >
            <option value="all">All statuses</option>
            <option value="missing">Missing only</option>
            <option value="late">Late only</option>
          </select>
        </div>
      </div>
    </div>
  );
}
