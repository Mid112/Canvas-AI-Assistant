export interface TokenResponse {
  access_token: string;
  token_type: string;
}

/** Matches backend CanvasConnectionResponse — encrypted_token is never exposed. */
export interface CanvasConnectionResponse {
  id: number;
  canvas_url: string;
  created_at: string;
}

/** Matches GET /api/v1/auth/me and PATCH /api/v1/auth/me/canvas-token responses. */
export interface UserResponse {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  avatar_url?: string | null;
  canvas_connections: CanvasConnectionResponse[];
  has_canvas_token: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  name: string;
  email: string;
  password: string;
}

export interface ProfileUpdatePayload {
  name?: string;
  email?: string;
  avatar_url?: string | null;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export type NotificationSettings = Record<string, boolean>;

export interface SessionResponse {
  id: number;
  created_at: string;
  expires_at: string;
  is_current: boolean;
}

export interface SecurityStatusResponse {
  two_factor_enabled: boolean;
  active_session_count: number;
}
