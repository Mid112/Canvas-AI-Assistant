// Frontend helper note: centralizes use instructor canvas timezone behavior so components and tests share one implementation.

import { useMemo } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { getInstructorCanvasTimezone } from "@/lib/canvas-timezone";

export function useInstructorCanvasTimezone(canvasUrl?: string): string | undefined {
  const { user } = useAuth();
  return useMemo(
    () => getInstructorCanvasTimezone(user, canvasUrl),
    [canvasUrl, user],
  );
}
