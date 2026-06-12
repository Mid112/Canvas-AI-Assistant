import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { getPostAuthPath } from "@/utils/onboarding";

export function GuestRoute() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-[#e8eef4] text-sm text-[#64748b]">
        Loading...
      </div>
    );
  }

  if (isAuthenticated && user) {
    return <Navigate to={getPostAuthPath(user.id, user.role)} replace />;
  }

  return <Outlet />;
}
