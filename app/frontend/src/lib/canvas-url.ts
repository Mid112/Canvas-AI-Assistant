// Frontend helper note: centralizes canvas url behavior so components and tests share one implementation.

const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "canvas_lms"]);

/** Docker-internal hostnames that browsers cannot resolve. */
const BROWSER_UNREACHABLE_HOSTS = new Set(["canvas_lms"]);

function parseUrl(url: string): URL | null {
  try {
    return new URL(normalizeCanvasUrl(url));
  } catch {
    return null;
  }
}

/** True when two Canvas base URLs refer to the same instance (incl. docker/local aliases). */
export function canvasUrlsEquivalent(a: string, b: string): boolean {
  const left = parseUrl(a);
  const right = parseUrl(b);
  if (!left || !right) {
    return normalizeCanvasUrl(a) === normalizeCanvasUrl(b);
  }

  if (left.protocol !== right.protocol || left.port !== right.port) {
    return false;
  }

  const leftLocal = LOCAL_HTTP_HOSTS.has(left.hostname);
  const rightLocal = LOCAL_HTTP_HOSTS.has(right.hostname);
  if (leftLocal && rightLocal) {
    return true;
  }

  return left.hostname === right.hostname;
}

export function normalizeCanvasUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Rewrites internal Canvas hosts (e.g. canvas_lms) to a browser-reachable URL
 * for links opened in a new tab. API calls should keep the original host.
 */
export function toBrowserCanvasUrl(url: string): string {
  const normalized = normalizeCanvasUrl(url);

  try {
    const parsed = new URL(normalized);
    if (BROWSER_UNREACHABLE_HOSTS.has(parsed.hostname)) {
      parsed.hostname = "localhost";
      return normalizeCanvasUrl(parsed.toString());
    }
  } catch {
    return normalized;
  }

  return normalized;
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
