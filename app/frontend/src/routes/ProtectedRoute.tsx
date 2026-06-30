import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { paths } from "@/routes/paths";
import { isOnboardingComplete, isOnboardingPath, requiresOnboarding } from "@/utils/onboarding";

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
    !isOnboardingPath(location.pathname)
  ) {
    return <Navigate to={paths.canvasInfo} replace />;
  }

  return <Outlet />;
}
