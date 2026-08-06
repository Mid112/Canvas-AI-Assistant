import { apiRequest } from "@/lib/api-request";

const INSTRUCTORS_PATH = "/admin/instructors";

/** One Canvas connection for an instructor — an instructor can have more
 * than one (one row per Canvas instance/school), so every action here is
 * scoped to a specific canvas_url, never "the" connection. */
export interface AdminCanvasConnection {
  id: number;
  canvas_url: string;
  last_sync_error: string | null;
  courses_synced_at: string | null;
  created_at: string;
}

export async function fetchInstructorCanvasConnections(
  accessToken: string,
  instructorId: string,
): Promise<AdminCanvasConnection[]> {
  return apiRequest<AdminCanvasConnection[]>(
    `${INSTRUCTORS_PATH}/${instructorId}/canvas-connections`,
    accessToken,
  );
}

/** Verified against Canvas server-side before saving — same guarantee as
 * the instructor's own self-service PATCH /auth/me/canvas-token. Returns
 * the instructor's full, refreshed connection list. */
export async function resetInstructorCanvasToken(
  accessToken: string,
  instructorId: string,
  payload: { canvasUrl: string; canvasToken: string },
): Promise<AdminCanvasConnection[]> {
  return apiRequest<AdminCanvasConnection[]>(
    `${INSTRUCTORS_PATH}/${instructorId}/canvas-token`,
    accessToken,
    {
      method: "PATCH",
      body: JSON.stringify({
        canvas_url: payload.canvasUrl,
        canvas_token: payload.canvasToken,
      }),
    },
  );
}
