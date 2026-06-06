export type UserRole = "instructor" | "ta" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}
