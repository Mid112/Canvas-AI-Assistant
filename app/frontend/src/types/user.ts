// Type note: documents the user data contract shared by services, components, and tests.

import type { CanvasConnectionResponse } from "@/types/auth";

export type UserRole = "instructor" | "admin";
export type CanvasConnection = CanvasConnectionResponse;

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  has_canvas_token: boolean;
  // Needed by Canvas-backed screens so API calls target the same Canvas host
  // where the token was saved, e.g. localhost Canvas Docker vs production Canvas.
  canvas_connections: CanvasConnectionResponse[];
}
