import { getInstitutionCanvasUrl } from "@/lib/institution-canvas";
import { canvasUrlsEquivalent } from "@/lib/canvas-url";
import type { Institution } from "@/types/institution";
import type { User } from "@/types/user";

export function getPrimaryCanvasConnectionUrl(
  user: Pick<User, "canvas_connections"> | null | undefined,
): string | undefined {
  return user?.canvas_connections?.[0]?.canvas_url;
}

function findMatchingConnection(
  connections: NonNullable<User["canvas_connections"]>,
  targetUrl: string,
) {
  return connections.find((connection) =>
    canvasUrlsEquivalent(connection.canvas_url, targetUrl),
  );
}

/**
 * Canvas URL for API calls — prefers a saved connection that matches the course
 * sync URL or institution env URL; otherwise the sole/first saved connection.
 */
export function resolveCanvasApiUrl(
  user: Pick<User, "canvas_connections"> | null | undefined,
  institutionId: string,
  preferredUrl?: string,
): string | undefined {
  const connections = user?.canvas_connections ?? [];
  if (connections.length === 0) {
    return undefined;
  }

  if (preferredUrl) {
    const preferredMatch = findMatchingConnection(connections, preferredUrl);
    if (preferredMatch) {
      return preferredMatch.canvas_url;
    }
  }

  const institutionUrl = getInstitutionCanvasUrl(institutionId);
  if (institutionUrl) {
    const institutionMatch = findMatchingConnection(connections, institutionUrl);
    if (institutionMatch) {
      return institutionMatch.canvas_url;
    }
  }

  if (connections.length === 1) {
    return connections[0]!.canvas_url;
  }

  return connections[0]!.canvas_url;
}

/** @deprecated Use resolveCanvasApiUrl — kept for tests and gradual migration. */
export function getCanvasConnectionUrlForInstitution(
  user: Pick<User, "canvas_connections"> | null | undefined,
  institutionId: string,
): string | undefined {
  return resolveCanvasApiUrl(user, institutionId);
}

export function isInstitutionConnected(
  user: Pick<User, "canvas_connections"> | null | undefined,
  institutionId: string,
): boolean {
  const connections = user?.canvas_connections ?? [];
  if (connections.length === 0) {
    return false;
  }

  const institutionUrl = getInstitutionCanvasUrl(institutionId);
  if (!institutionUrl) {
    return false;
  }

  return connections.some((connection) =>
    canvasUrlsEquivalent(connection.canvas_url, institutionUrl),
  );
}

export function getConnectedInstitutions(
  user: Pick<User, "canvas_connections"> | null | undefined,
  allInstitutions: Institution[],
): Institution[] {
  if (!user?.canvas_connections?.length) {
    return [];
  }

  return allInstitutions.filter((institution) =>
    isInstitutionConnected(user, institution.id),
  );
}
