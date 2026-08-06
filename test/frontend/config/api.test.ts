// Test note: covers the api.test behavior so future changes can preserve the expected Canvas workflow contract.

import { afterEach, describe, expect, it, vi } from "vitest";

describe("api config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the development proxy base url in development mode", async () => {
    vi.stubEnv("MODE", "development");
    const { API_BASE_URL } = await import("@/config/api");
    expect(API_BASE_URL).toBe("/api/v1");
  });

  it("uses the configured production base url outside development", async () => {
    vi.stubEnv("MODE", "test");
    vi.stubEnv("VITE_API_BASE_URL", "https://api.example.com/v1");
    const { API_BASE_URL } = await import("@/config/api");
    expect(API_BASE_URL).toBe("https://api.example.com/v1");
  });

  it("exposes the auth token storage key", async () => {
    vi.stubEnv("MODE", "production");
    const { AUTH_TOKEN_KEY } = await import("@/config/api");
    expect(AUTH_TOKEN_KEY).toBe("access_token");
  });
});
