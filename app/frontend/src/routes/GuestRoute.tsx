import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { paths } from "@/routes/paths";

export function GuestRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-[#e8eef4] text-sm text-[#64748b]">
        Loading...
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to={paths.canvasInfo} replace />;
  }

  return <Outlet />;
}
