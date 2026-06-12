/** Matches PATCH /api/v1/auth/me/canvas-token request body. */
export interface CanvasTokenUpdateRequest {
  canvas_token: string;
}

/** Matches auth user response after canvas token is saved. */
export interface CanvasTokenUpdateResponse {
  id: number;
  email: string;
  is_active: boolean;
  has_canvas_token: boolean;
}
