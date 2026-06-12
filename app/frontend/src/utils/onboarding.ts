import { hasCompletedOnboarding } from "@/lib/onboarding-storage";
import { paths } from "@/routes/paths";
import type { UserRole } from "@/types/user";
import { getDashboardPath } from "@/utils/navigation";

export const ONBOARDING_PATHS = [
  paths.canvasInfo,
  paths.connectCanvas,
  paths.reviewPermissions,
  paths.canvasAuthError,
] as const;

export function isOnboardingPath(pathname: string): boolean {
  return ONBOARDING_PATHS.some((path) => pathname === path);
}

export function getPostAuthPath(userId: number, role: UserRole): string {
  return hasCompletedOnboarding(userId)
    ? getDashboardPath(role)
    : paths.canvasInfo;
}
