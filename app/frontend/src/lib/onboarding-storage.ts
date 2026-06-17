const ONBOARDING_COMPLETE_KEY = "onboarding_complete_user_ids";

function readCompletedUserIds(): Set<string> {
  try {
    const raw = localStorage.getItem(ONBOARDING_COMPLETE_KEY);
    if (!raw) {
      return new Set();
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return new Set();
    }

    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function writeCompletedUserIds(ids: Set<string>): void {
  localStorage.setItem(ONBOARDING_COMPLETE_KEY, JSON.stringify([...ids]));
}

export function hasCompletedOnboarding(userId: number): boolean {
  return readCompletedUserIds().has(String(userId));
}

export function markOnboardingComplete(userId: number): void {
  const ids = readCompletedUserIds();
  ids.add(String(userId));
  writeCompletedUserIds(ids);
}
