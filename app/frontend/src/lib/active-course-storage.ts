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
  return Number.isInteger(parsed) && parsed > 0
    ? { localId: parsed, displayName: `Course ${parsed}` }
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

export function setStoredActiveCourseId(
  scopeId: string,
  localCourseId: number | null,
): void {
  setStoredActiveCourseSelection(
    scopeId,
    localCourseId == null
      ? null
      : { localId: localCourseId, displayName: `Course ${localCourseId}` },
  );
}
