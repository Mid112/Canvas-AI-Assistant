// Component note: renders reusable auth layout UI for the instructor/admin experience.

import { Outlet } from "react-router-dom";

import { pageSurfaceClassName } from "@/lib/surface-styles";
import { cn } from "@/lib/utils";

export function AuthLayout() {
  return (
    <div className={cn("min-h-svh", pageSurfaceClassName)}>
      <Outlet />
    </div>
  );
}
