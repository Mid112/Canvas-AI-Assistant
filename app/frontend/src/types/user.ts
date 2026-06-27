export type UserRole = "instructor" | "ta" | "admin";

export interface CanvasConnection {
  id: number;
  canvas_url: string;
  created_at: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  has_canvas_token: boolean;
  canvas_connections: CanvasConnection[];
}
