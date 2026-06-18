/** Matches PATCH /api/v1/auth/me/canvas-token request body. */
export interface CanvasTokenUpdateRequest {
  canvas_tokens: string[];
}

/** Matches POST validation result for a Canvas access token. */
export type CanvasTokenValidationStatus = "valid" | "expired" | "invalid";

/** Matches auth user response after canvas token is saved. */
export interface CanvasTokenUpdateResponse {
  id: number;
  email: string;
  is_active: boolean;
  has_canvas_token: boolean;
}
