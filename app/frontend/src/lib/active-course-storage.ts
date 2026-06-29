const STORAGE_PREFIX = "canvas-workflow-active-course";

function storageKey(scopeId: string): string {
  return `${STORAGE_PREFIX}-${scopeId}`;
}

export function getStoredActiveCourseId(scopeId: string): number | null {
  try {
    const raw = localStorage.getItem(storageKey(scopeId));
    if (!raw) {
      return null;
    }

    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function setStoredActiveCourseId(
  scopeId: string,
  localCourseId: number | null,
): void {
  if (localCourseId == null) {
    localStorage.removeItem(storageKey(scopeId));
    return;
  }

  localStorage.setItem(storageKey(scopeId), String(localCourseId));
}
