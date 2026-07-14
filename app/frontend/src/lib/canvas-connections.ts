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

function parseConnectionInstitutionId(institutionId: string): number | null {
  const match = /^connection-(\d+)$/.exec(institutionId);
  if (!match) {
    return null;
  }
  const id = Number.parseInt(match[1]!, 10);
  return Number.isFinite(id) ? id : null;
}

export function institutionFromCanvasConnection(
  connection: NonNullable<User["canvas_connections"]>[number],
): Institution {
  let host = connection.canvas_url;
  try {
    host = new URL(connection.canvas_url).hostname;
  } catch {
    // Keep the raw URL when it is not parseable.
  }

  const shortName = host.replace(/^www\./, "");
  return {
    id: `connection-${connection.id}`,
    name: connection.canvas_url,
    shortName,
    canvasUrl: connection.canvas_url,
  };
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

  const connectionId = parseConnectionInstitutionId(institutionId);
  if (connectionId != null) {
    const connectionMatch = connections.find(
      (connection) => connection.id === connectionId,
    );
    if (connectionMatch) {
      return connectionMatch.canvas_url;
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

  const connectionId = parseConnectionInstitutionId(institutionId);
  if (connectionId != null) {
    return connections.some((connection) => connection.id === connectionId);
  }

  const institutionUrl = getInstitutionCanvasUrl(institutionId);
  if (!institutionUrl) {
    return false;
  }

  return connections.some((connection) =>
    canvasUrlsEquivalent(connection.canvas_url, institutionUrl),
  );
}

/**
 * Institutions the user can switch between. Catalog entries win when a
 * connection matches an env-configured Canvas URL; otherwise each unmatched
 * connection becomes a selectable institution derived from its host.
 */
export function getConnectedInstitutions(
  user: Pick<User, "canvas_connections"> | null | undefined,
  allInstitutions: Institution[],
): Institution[] {
  const connections = user?.canvas_connections ?? [];
  if (connections.length === 0) {
    return [];
  }

  const matched: Institution[] = [];
  const unmatched: typeof connections = [];

  for (const connection of connections) {
    const catalogMatch = allInstitutions.find((institution) => {
      const institutionUrl = getInstitutionCanvasUrl(institution.id);
      return (
        institutionUrl != null &&
        canvasUrlsEquivalent(connection.canvas_url, institutionUrl)
      );
    });

    if (catalogMatch) {
      matched.push({
        ...catalogMatch,
        canvasUrl: connection.canvas_url,
      });
    } else {
      unmatched.push(connection);
    }
  }

  return [
    ...matched,
    ...unmatched.map((connection) => institutionFromCanvasConnection(connection)),
  ];
}
