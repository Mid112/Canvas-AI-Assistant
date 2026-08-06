// Frontend helper note: centralizes assignment utils behavior so components and tests share one implementation.

import type {
  Assignment,
  AssignmentFieldChange,
  AssignmentFormValues,
  AssignmentUpdatePayload,
} from "@/types/assignment";

const DATETIME_LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

export function isDatetimeLocalValue(value: string): boolean {
  const trimmed = value.trim();
  return (
    DATETIME_LOCAL_RE.test(trimmed)
    && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)
  );
}

function parseDatetimeLocalParts(value: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} | null {
  const match = DATETIME_LOCAL_RE.exec(value.trim());
  if (!match) {
    return null;
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
}

function getTimeZoneOffsetMs(atUtcMs: number, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(atUtcMs)).map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - atUtcMs;
}

export function datetimeLocalInTimeZoneToUtcIso(
  localValue: string,
  timeZone: string,
): string {
  const parts = parseDatetimeLocalParts(localValue);
  if (!parts) {
    return new Date(localValue).toISOString();
  }

  const desiredLocalMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    0,
  );
  let utcMs = desiredLocalMs;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    utcMs = desiredLocalMs - getTimeZoneOffsetMs(utcMs, timeZone);
  }
  return new Date(utcMs).toISOString();
}

export function formatUtcInstantToDatetimeLocal(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** Parse API/LLM due-date strings. Naive ISO without offset is UTC wall-clock. */
export function parseDueDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const normalized = hasTimezone
    ? trimmed
    : /T\d{2}:\d{2}/.test(trimmed)
      ? `${trimmed}Z`
      : trimmed;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDueDateForInput(
  dueAt: string | null,
  timeZone?: string,
): string {
  if (!dueAt) {
    return "";
  }

  const date = parseDueDate(dueAt);
  if (!date) {
    return "";
  }

  if (timeZone) {
    return formatUtcInstantToDatetimeLocal(date, timeZone);
  }

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDatetimeLocalForDisplay(value: string): string {
  const parts = parseDatetimeLocalParts(value);
  if (!parts) {
    return value;
  }

  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute),
  );
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

export function formatDueDateForDisplay(
  value: string | null | undefined,
  options?: { timeZone?: string; treatAsDatetimeLocal?: boolean },
): string {
  if (!value) {
    return "No due date";
  }

  if (options?.treatAsDatetimeLocal || isDatetimeLocalValue(value)) {
    return formatDatetimeLocalForDisplay(value);
  }

  const date = parseDueDate(value);
  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: options?.timeZone,
  }).format(date);
}

export function formatDueDateForApi(dueDate: string, timeZone?: string): string {
  if (isDatetimeLocalValue(dueDate) && timeZone) {
    return datetimeLocalInTimeZoneToUtcIso(dueDate, timeZone);
  }

  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) {
    return dueDate;
  }
  return date.toISOString();
}

export function assignmentToFormValues(
  assignment: Assignment,
  timeZone?: string,
): AssignmentFormValues {
  return {
    name: assignment.name,
    description: assignment.description ?? "",
    dueDate: formatDueDateForInput(assignment.due_at, timeZone),
  };
}

export function formValuesToUpdatePayload(
  values: AssignmentFormValues,
  timeZone?: string,
): AssignmentUpdatePayload {
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    due_at: values.dueDate ? formatDueDateForApi(values.dueDate, timeZone) : null,
  };
}

export function buildAssignmentChanges(
  original: Assignment,
  updated: AssignmentFormValues,
  timeZone?: string,
): AssignmentFieldChange[] {
  const changes: AssignmentFieldChange[] = [];
  const originalValues = assignmentToFormValues(original, timeZone);

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
      original: formatDueDateForDisplay(original.due_at, { timeZone }),
      updated: formatDueDateForDisplay(
        updated.dueDate ? formatDueDateForApi(updated.dueDate, timeZone) : null,
        { timeZone },
      ),
    });
  }

  return changes;
}

export function hasAssignmentChanges(
  original: Assignment,
  updated: AssignmentFormValues,
  timeZone?: string,
): boolean {
  return buildAssignmentChanges(original, updated, timeZone).length > 0;
}
