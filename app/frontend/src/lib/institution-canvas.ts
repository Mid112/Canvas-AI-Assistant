/**
 * Institution-specific Canvas base URLs.
 *
 * The backend stores tokens per canvas_url and requires the same URL on course/
 * assignment requests — keep these in sync with backend CANVAS_API_URL / connect flow.
 */
const DEFAULT_UBC_CANVAS_URL = "https://canvas.ubc.ca";
const DEFAULT_UBCO_CANVAS_URL = "https://canvas.ubc.ca";

export function getInstitutionCanvasUrl(institutionId: string): string {
  if (institutionId === "ubco") {
    return import.meta.env.VITE_CANVAS_UBCO_URL ?? DEFAULT_UBCO_CANVAS_URL;
  }

  return import.meta.env.VITE_CANVAS_UBC_URL ?? DEFAULT_UBC_CANVAS_URL;
}

/** Canvas courses list page — instructors create new courses here, then sync back. */
export function getInstitutionCanvasNewCourseUrl(institutionId: string): string {
  return `${getInstitutionCanvasUrl(institutionId)}/courses`;
}
