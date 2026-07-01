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
 * When unset, API calls use the sole saved Canvas connection (e.g. local Docker at
 * http://localhost:3000). Set VITE_CANVAS_*_URL to disambiguate multiple connections.
 */
export function getInstitutionCanvasUrl(institutionId: string): string | undefined {
  const url =
    institutionId === "ubco"
      ? import.meta.env.VITE_CANVAS_UBCO_URL
      : import.meta.env.VITE_CANVAS_UBC_URL;

  const trimmed = url?.trim();
  return trimmed ? trimmed : undefined;
}
