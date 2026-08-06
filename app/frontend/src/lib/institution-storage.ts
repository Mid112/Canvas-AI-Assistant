// Frontend helper note: centralizes institution storage behavior so components and tests share one implementation.

const INSTITUTION_STORAGE_PREFIX = "canvas-workflow-institution";

export function getInstitutionStorageKey(userId: number): string {
  return `${INSTITUTION_STORAGE_PREFIX}-${userId}`;
}

export function getStoredInstitutionId(userId: number): string | null {
  return localStorage.getItem(getInstitutionStorageKey(userId));
}

export function setStoredInstitutionId(
  userId: number,
  institutionId: string,
): void {
  localStorage.setItem(getInstitutionStorageKey(userId), institutionId);
}

export function clearStoredInstitutionId(userId: number): void {
  localStorage.removeItem(getInstitutionStorageKey(userId));
}
