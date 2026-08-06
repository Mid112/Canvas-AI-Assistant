import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  authCardClassName,
  pageSurfaceClassName,
} from "@/lib/surface-styles";

interface OnboardingPageShellProps {
  children: ReactNode;
  progress?: ReactNode;
  cardClassName?: string;
}

export function OnboardingPageShell({
  children,
  progress,
  cardClassName,
}: OnboardingPageShellProps) {
  return (
    <div className={cn("min-h-svh overflow-y-auto", pageSurfaceClassName)}>
      <div className="flex min-h-svh flex-col items-center justify-center p-4 py-8 md:p-8">
        {progress}
        <div className={cn(authCardClassName, "max-w-md", cardClassName)}>
          {children}
        </div>
      </div>
    </div>
  );
}
