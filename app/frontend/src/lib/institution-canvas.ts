/**
 * Institution-specific Canvas base URLs from frontend env only.
 *
 * Set per deployment — there is no hardcoded production default:
 *   VITE_CANVAS_UBC_URL=https://canvas.ubc.ca
 *   VITE_CANVAS_UBCO_URL=https://canvas.ubc.ca
 *
 * Local Canvas Docker:
 *   VITE_CANVAS_UBC_URL=http://localhost:3000
 *
 * When unset, course/assignment API calls use the user's saved Canvas
 * connection(s) via getCanvasConnectionUrlForInstitution instead.
 */
export function getInstitutionCanvasUrl(institutionId: string): string | undefined {
  const url =
    institutionId === "ubco"
      ? import.meta.env.VITE_CANVAS_UBCO_URL
      : import.meta.env.VITE_CANVAS_UBC_URL;

  const trimmed = url?.trim();
  return trimmed ? trimmed : undefined;
}
