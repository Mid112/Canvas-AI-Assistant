// File note: supports the protected route area of the Canvas workflow assistant.

import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import {
  canAccessWithoutOnboarding,
  isOnboardingComplete,
  requiresOnboarding,
} from "@/utils/onboarding";
import { paths } from "@/routes/paths";

export function ProtectedRoute() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-muted/20 text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={paths.login} state={{ from: location }} replace />;
  }

  if (
    user &&
    requiresOnboarding(user.role) &&
    !isOnboardingComplete(user) &&
    !canAccessWithoutOnboarding(location.pathname, user.role)
  ) {
    return <Navigate to={paths.canvasInfo} replace />;
  }

  return <Outlet />;
}
