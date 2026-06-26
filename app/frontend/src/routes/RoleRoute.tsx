import { Navigate, Outlet } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { getDashboardPath } from "@/utils/navigation";
import type { UserRole } from "@/types/user";

interface RoleRouteProps {
  role: UserRole;
}

export function RoleRoute({ role }: RoleRouteProps) {
  const { user } = useAuth();

  if (user && user.role !== role) {
    return <Navigate to={getDashboardPath(user.role)} replace />;
  }

  return <Outlet />;
}
