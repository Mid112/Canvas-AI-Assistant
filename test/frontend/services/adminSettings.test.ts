import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ADMIN_SETTINGS_PATH,
  fetchAdminSettings,
  updateAdminSettings,
} from "@/services/adminSettings";

vi.mock("@/config/api", () => ({
  API_BASE_URL: "http://localhost:8000/api/v1",
}));

const settings = {
  organization_name: "Example University",
  allow_instructor_self_registration: true,
  session_timeout_minutes: 60,
};

describe("adminSettings service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches admin settings", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ settings }), { status: 200 }),
    );

    const result = await fetchAdminSettings("access-token");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `http://localhost:8000/api/v1${ADMIN_SETTINGS_PATH}`,
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(result).toEqual(settings);
  });

  it("updates admin settings", async () => {
    const updated = { ...settings, session_timeout_minutes: 90 };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ settings: updated }), { status: 200 }),
    );

    const result = await updateAdminSettings("access-token", {
      session_timeout_minutes: 90,
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `http://localhost:8000/api/v1${ADMIN_SETTINGS_PATH}`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ settings: { session_timeout_minutes: 90 } }),
      }),
    );
    expect(result).toEqual(updated);
  });
});
