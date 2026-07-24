import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DIAGNOSTICS_PATH,
  FAILED_OPERATIONS_PATH,
  fetchDiagnostics,
  fetchFailedOperations,
} from "@/services/troubleshoot";

vi.mock("@/config/api", () => ({
  API_BASE_URL: "http://localhost:8000/api/v1",
}));

const diagnosticsResponse = {
  canvas_api_url: "https://canvas.ubc.ca",
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

const failedOperationsResponse = {
  items: [
    {
      id: 1,
      action_name: "create_assignment",
      user_name: "Jane Doe",
      user_email: "jane@example.com",
      course_name: "CPSC 310",
      error_detail: "Canvas server error: 503",
      created_at: "2026-07-21T18:00:00Z",
      executed_at: null,
    },
  ],
  total: 1,
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

  it("fetches failed operations with default pagination", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(failedOperationsResponse), { status: 200 }),
    );

    const result = await fetchFailedOperations("access-token");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `http://localhost:8000/api/v1${FAILED_OPERATIONS_PATH}?limit=50&offset=0`,
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    expect(result).toEqual(failedOperationsResponse);
  });

  it("fetches failed operations with the given limit/offset", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(failedOperationsResponse), { status: 200 }),
    );

    await fetchFailedOperations("access-token", { limit: 10, offset: 20 });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `http://localhost:8000/api/v1${FAILED_OPERATIONS_PATH}?limit=10&offset=20`,
      expect.any(Object),
    );
  });
});
