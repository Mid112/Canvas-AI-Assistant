import type { User } from "@/types/user";

export function getPrimaryCanvasConnectionUrl(
  user: Pick<User, "canvas_connections"> | null | undefined,
): string | undefined {
  // Until multi-school selection is formalized in InstitutionContext, every
  // Canvas-backed request should use this single fallback rule.
  return user?.canvas_connections?.[0]?.canvas_url;
}
