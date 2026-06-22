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
