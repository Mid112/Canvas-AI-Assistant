import type {
  Assignment,
  AssignmentFieldChange,
  AssignmentFormValues,
  AssignmentUpdatePayload,
} from "@/types/assignment";

export function formatDueDateForInput(dueAt: string | null): string {
  if (!dueAt) {
    return "";
  }

  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDueDateForDisplay(value: string | null | undefined): string {
  if (!value) {
    return "No due date";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDueDateForApi(dueDate: string): string {
  return new Date(dueDate).toISOString();
}

export function assignmentToFormValues(assignment: Assignment): AssignmentFormValues {
  return {
    name: assignment.name,
    description: assignment.description ?? "",
    dueDate: formatDueDateForInput(assignment.due_at),
  };
}

export function formValuesToUpdatePayload(
  values: AssignmentFormValues,
): AssignmentUpdatePayload {
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    due_at: values.dueDate ? formatDueDateForApi(values.dueDate) : null,
  };
}

export function buildAssignmentChanges(
  original: Assignment,
  updated: AssignmentFormValues,
): AssignmentFieldChange[] {
  const changes: AssignmentFieldChange[] = [];
  const originalValues = assignmentToFormValues(original);

  if (originalValues.name !== updated.name.trim()) {
    changes.push({
      field: "title",
      label: "Title",
      original: originalValues.name,
      updated: updated.name.trim(),
    });
  }

  if (originalValues.description !== updated.description.trim()) {
    changes.push({
      field: "description",
      label: "Description",
      original: originalValues.description || "—",
      updated: updated.description.trim() || "—",
    });
  }

  if (originalValues.dueDate !== updated.dueDate) {
    changes.push({
      field: "dueDate",
      label: "Due date",
      original: formatDueDateForDisplay(original.due_at),
      updated: formatDueDateForDisplay(
        updated.dueDate ? formatDueDateForApi(updated.dueDate) : null,
      ),
    });
  }

  return changes;
}

export function hasAssignmentChanges(
  original: Assignment,
  updated: AssignmentFormValues,
): boolean {
  return buildAssignmentChanges(original, updated).length > 0;
}
