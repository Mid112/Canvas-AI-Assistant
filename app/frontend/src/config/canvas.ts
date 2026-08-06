// File note: supports the canvas area of the Canvas workflow assistant.

const configuredCanvasApiUrl = import.meta.env.VITE_CANVAS_API_URL?.trim();

export const CANVAS_API_URL = configuredCanvasApiUrl || undefined;
