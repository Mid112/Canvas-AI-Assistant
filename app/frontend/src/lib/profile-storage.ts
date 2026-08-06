export interface ProfileDraft {
  name: string;
  department: string;
  title: string;
}

const storageKey = (userId: number) => `profile-draft:${userId}`;

export function getStoredProfileDraft(userId: number): ProfileDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as ProfileDraft;
  } catch {
    return null;
  }
}

export function setStoredProfileDraft(userId: number, draft: ProfileDraft): void {
  localStorage.setItem(storageKey(userId), JSON.stringify(draft));
}

export function clearStoredProfileDraft(userId: number): void {
  localStorage.removeItem(storageKey(userId));
}

/** Frontend-only profile save until backend profile endpoints exist. */
export function saveProfileDraft(userId: number, draft: ProfileDraft): void {
  setStoredProfileDraft(userId, draft);
}

/** Frontend-only profile delete simulation — clears local profile data. */
export function deleteProfileLocally(userId: number): void {
  clearStoredProfileDraft(userId);
}
