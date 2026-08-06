import type { User } from "@/types/user";

/** IANA timezone from the instructor's Canvas account, if stored. */
export function getInstructorCanvasTimezone(
  user: Pick<User, "canvas_connections"> | null | undefined,
  canvasUrl?: string,
): string | undefined {
  const connections = user?.canvas_connections ?? [];
  if (canvasUrl) {
    const normalized = canvasUrl.replace(/\/+$/, "");
    const match = connections.find(
      (connection) => connection.canvas_url.replace(/\/+$/, "") === normalized,
    );
    return match?.time_zone ?? undefined;
  }
  return connections.find((connection) => connection.time_zone)?.time_zone
    ?? connections[0]?.time_zone
    ?? undefined;
}
