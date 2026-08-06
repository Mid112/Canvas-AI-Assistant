// Component note: renders reusable auth page shell UI for the instructor/admin experience.

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  authCardClassName,
  pageSurfaceClassName,
} from "@/lib/surface-styles";

interface AuthPageShellProps {
  children: ReactNode;
  className?: string;
  cardClassName?: string;
  centered?: boolean;
}

export function AuthPageShell({
  children,
  className,
  cardClassName,
  centered = true,
}: AuthPageShellProps) {
  return (
    <div
      className={cn(
        pageSurfaceClassName,
        centered
          ? "flex min-h-svh items-center justify-center p-4 md:p-8"
          : "min-h-svh overflow-y-auto p-4 py-8 md:p-8",
        className,
      )}
    >
      <div className={cn(authCardClassName, "max-w-md", cardClassName)}>
        {children}
      </div>
    </div>
  );
}
