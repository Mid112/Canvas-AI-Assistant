// Hook note: packages use canvas connection url state/effects for route components that need the same behavior.

import { useAuth } from "@/contexts/AuthContext";
import { useInstitution } from "@/contexts/useInstitution";
import { resolveCanvasApiUrl } from "@/lib/canvas-connections";

/** Resolved Canvas host for the current user + selected institution. */
export function useCanvasConnectionUrl(preferredUrl?: string): string | undefined {
  const { user } = useAuth();
  const { selectedInstitution } = useInstitution();

  return resolveCanvasApiUrl(
    user,
    selectedInstitution.id,
    preferredUrl ?? selectedInstitution.canvasUrl,
  );
}
