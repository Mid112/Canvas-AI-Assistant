import { useAuth } from "@/contexts/AuthContext";
import { useInstitution } from "@/contexts/useInstitution";
import { getCanvasConnectionUrlForInstitution } from "@/lib/canvas-connections";

/** Resolved Canvas host for the current user + selected institution. */
export function useCanvasConnectionUrl(): string | undefined {
  const { user } = useAuth();
  const { selectedInstitution } = useInstitution();

  return getCanvasConnectionUrlForInstitution(user, selectedInstitution.id);
}
