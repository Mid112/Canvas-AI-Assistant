import type { ActiveCourseSelection } from "@/types/course";

const STORAGE_PREFIX = "canvas-workflow-active-course";

function storageKey(scopeId: string): string {
  return `${STORAGE_PREFIX}-${scopeId}`;
}

function isActiveCourseSelection(value: unknown): value is ActiveCourseSelection {
  return (
    typeof value === "object" &&
    value !== null &&
    Number.isInteger((value as ActiveCourseSelection).localId) &&
    (value as ActiveCourseSelection).localId > 0 &&
    typeof (value as ActiveCourseSelection).displayName === "string" &&
    (value as ActiveCourseSelection).displayName.trim().length > 0
  );
}

function parseLegacyCourseId(raw: string): ActiveCourseSelection | null {
  const parsed = Number(raw);
  // Pre-dates ActiveCourseSelection's JSON format — only the local DB id was
  // ever stored, so there's no real course name to show. Never render that
  // raw id as the display name; the instructor doesn't know or care about it.
  return Number.isInteger(parsed) && parsed > 0
    ? { localId: parsed, displayName: "Selected course" }
    : null;
}

export function getStoredActiveCourseSelection(
  scopeId: string,
): ActiveCourseSelection | null {
  try {
    const raw = localStorage.getItem(storageKey(scopeId));
    if (!raw) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      return isActiveCourseSelection(parsed) ? parsed : parseLegacyCourseId(raw);
    } catch {
      return parseLegacyCourseId(raw);
    }
  } catch {
    return null;
  }
}

export function getStoredActiveCourseId(scopeId: string): number | null {
  return getStoredActiveCourseSelection(scopeId)?.localId ?? null;
}

export function setStoredActiveCourseSelection(
  scopeId: string,
  selection: ActiveCourseSelection | null,
): void {
  if (selection == null) {
    localStorage.removeItem(storageKey(scopeId));
    return;
  }

  localStorage.setItem(storageKey(scopeId), JSON.stringify(selection));
}
