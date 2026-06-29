/** Matches GET /api/v1/canvas/courses response item. */
export interface CanvasCourse {
  canvas_id: number;
  local_id: number | null;
  name: string;
  course_code: string;
  workflow_state: string;
  total_students: number | null;
}

/** Matches PATCH /api/v1/auth/me/canvas-token request body. */
export interface CanvasTokenUpdateRequest {
  canvas_token: string;
  canvas_url?: string;
}

/** Result of validating a Canvas access token. */
export type CanvasTokenValidationStatus = "valid" | "expired" | "invalid";

/** Matches POST /api/v1/auth/me/canvas-token/validate response body. */
export interface CanvasTokenValidationResponse {
  status: CanvasTokenValidationStatus;
}

/** Matches auth user response after canvas token is saved. */
export interface CanvasTokenUpdateResponse {
  id: number;
  email: string;
  is_active: boolean;
  has_canvas_token: boolean;
}
