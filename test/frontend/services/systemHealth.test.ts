import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchLatestSystemHealth,
  fetchSystemHealth,
  fetchSystemHealthHistory,
  SYSTEM_HEALTH_HISTORY_PATH,
  SYSTEM_HEALTH_LATEST_PATH,
  SYSTEM_HEALTH_PATH,
} from "@/services/systemHealth";

vi.mock("@/config/api", () => ({
  API_BASE_URL: "http://localhost:8000/api/v1",
}));

const healthResponse = {
  overall_status: "healthy",
  checked_at: "2026-07-21T18:00:00Z",
  services: {
    backend: { status: "healthy", latency_ms: 1, error_detail: null, uptime_seconds: 120 },
    database: { status: "healthy", latency_ms: 8, error_detail: null, uptime_seconds: null },
    canvas: { status: "healthy", latency_ms: 50, error_detail: null, uptime_seconds: null },
    ai: { status: "healthy", latency_ms: 400, error_detail: null, uptime_seconds: null },
  },
};

describe("systemHealth service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches system health", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(healthResponse), { status: 200 }),
    );

    const result = await fetchSystemHealth("access-token");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `http://localhost:8000/api/v1${SYSTEM_HEALTH_PATH}`,
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(result).toEqual(healthResponse);
  });

  it("fetches the cheap latest health status", async () => {
    const latestResponse = {
      overall_status: "degraded",
      checked_at: "2026-07-21T18:00:00Z",
      services: { canvas: healthResponse.services.canvas },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(latestResponse), { status: 200 }),
    );

    const result = await fetchLatestSystemHealth("access-token");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `http://localhost:8000/api/v1${SYSTEM_HEALTH_LATEST_PATH}`,
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(result).toEqual(latestResponse);
  });

  it("fetches system health history with the given window", async () => {
    const historyResponse = {
      services: {
        backend: [{ status: "healthy", latency_ms: 1, checked_at: "2026-07-21T18:00:00Z" }],
      },
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(historyResponse), { status: 200 }),
    );

    const result = await fetchSystemHealthHistory("access-token", 48);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `http://localhost:8000/api/v1${SYSTEM_HEALTH_HISTORY_PATH}?hours=48`,
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(result).toEqual(historyResponse);
  });

  it("defaults the history window to 24 hours", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ services: {} }), { status: 200 }),
    );

    await fetchSystemHealthHistory("access-token");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `http://localhost:8000/api/v1${SYSTEM_HEALTH_HISTORY_PATH}?hours=24`,
      expect.any(Object),
    );
  });
});
