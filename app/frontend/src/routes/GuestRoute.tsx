// File note: supports the guest route area of the Canvas workflow assistant.

import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { getPostAuthPath } from "@/utils/onboarding";

export function GuestRoute() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-canvas-muted text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (isAuthenticated && user) {
    return <Navigate to={getPostAuthPath(user)} replace />;
  }

  return <Outlet />;
}
