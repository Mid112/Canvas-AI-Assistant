import { getInstitutionCanvasUrl } from "@/lib/institution-canvas";
import { normalizeCanvasUrl } from "@/lib/canvas-url";
import type { User } from "@/types/user";

export function getPrimaryCanvasConnectionUrl(
  user: Pick<User, "canvas_connections"> | null | undefined,
): string | undefined {
  return user?.canvas_connections?.[0]?.canvas_url;
}

/**
 * Canvas URL for API calls — prefers a saved connection that matches the
 * institution env URL when configured; otherwise the sole saved connection.
 */
export function getCanvasConnectionUrlForInstitution(
  user: Pick<User, "canvas_connections"> | null | undefined,
  institutionId: string,
): string | undefined {
  const connections = user?.canvas_connections ?? [];
  if (connections.length === 0) {
    return undefined;
  }

  const institutionUrl = getInstitutionCanvasUrl(institutionId);
  if (institutionUrl) {
    const normalizedInstitutionUrl = normalizeCanvasUrl(institutionUrl);
    const match = connections.find(
      (connection) =>
        normalizeCanvasUrl(connection.canvas_url) === normalizedInstitutionUrl,
    );
    if (match) {
      return match.canvas_url;
    }
  }

  if (connections.length === 1) {
    return connections[0]!.canvas_url;
  }

  return undefined;
}
