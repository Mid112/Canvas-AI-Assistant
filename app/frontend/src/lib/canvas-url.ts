const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "canvas_lms"]);

export function normalizeCanvasUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Returns an error message when invalid, or null when valid. */
export function validateCanvasUrl(url: string): string | null {
  const normalized = normalizeCanvasUrl(url);

  if (!normalized) {
    return "Canvas URL is required";
  }

  if (normalized.startsWith("https://")) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    if (
      import.meta.env.DEV &&
      parsed.protocol === "http:" &&
      parsed.hostname &&
      LOCAL_HTTP_HOSTS.has(parsed.hostname)
    ) {
      return null;
    }
  } catch {
    return "Canvas URL must be a valid URL";
  }

  return "Canvas URL must be an https:// URL";
}
