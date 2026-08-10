import { beforeEach, describe, expect, it, vi } from "vitest";

import { DIAGNOSTICS_PATH, fetchDiagnostics } from "@/services/troubleshoot";

vi.mock("@/config/api", () => ({
  API_BASE_URL: "http://localhost:8000/api/v1",
}));

const diagnosticsResponse = {
  canvas_api_url: "https://canvas.example.edu",
  backend_uptime_seconds: 120,
  health: { overall_status: "healthy", checked_at: "2026-07-21T18:00:00Z", services: {} },
  instructor_canvas: { total: 10, healthy: 9, failing: 1, failing_connections: [] },
  llm_providers: [
    {
      id: "openai",
      name: "OpenAI",
      hosting: "internet",
      default_model: "gpt-4",
      configured: true,
      status: "available",
      models: [],
      detail: null,
    },
  ],
  recent_failed_operations_count: 2,
};

describe("troubleshoot service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches diagnostics", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(diagnosticsResponse), { status: 200 }),
    );

    const result = await fetchDiagnostics("access-token");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `http://localhost:8000/api/v1${DIAGNOSTICS_PATH}`,
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(result).toEqual(diagnosticsResponse);
  });
});
