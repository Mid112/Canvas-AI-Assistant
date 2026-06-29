export type UserRole = "instructor" | "ta" | "admin";

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  is_active: boolean;
  has_canvas_token: boolean;
}
