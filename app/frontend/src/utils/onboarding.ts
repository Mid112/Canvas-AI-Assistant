import { hasCompletedOnboarding } from "@/lib/onboarding-storage";
import { paths } from "@/routes/paths";
import type { User, UserRole } from "@/types/user";
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

export function requiresOnboarding(role: UserRole): boolean {
  return role !== "admin";
}

export function isOnboardingComplete(user: Pick<User, "id" | "canvas_connections">): boolean {
  return (
    hasCompletedOnboarding(user.id) || user.canvas_connections.length > 0
  );
}

export function getPostAuthPath(user: Pick<User, "id" | "role" | "canvas_connections">): string {
  if (!requiresOnboarding(user.role) || isOnboardingComplete(user)) {
    return getDashboardPath(user.role);
  }

  return paths.canvasInfo;
}
