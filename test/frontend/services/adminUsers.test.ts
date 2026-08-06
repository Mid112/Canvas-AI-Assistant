// Test note: covers the admin users.test behavior so future changes can preserve the expected Canvas workflow contract.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAdmin } from "@/services/adminUsers";

vi.mock("@/config/api", () => ({
  API_BASE_URL: "http://localhost:8000/api/v1",
}));

const adminUser = {
  id: 2,
  name: "Admin User",
  email: "admin@example.com",
  role: "admin",
  is_active: true,
  created_at: "2026-06-26T00:00:00.000Z",
};

describe("adminUsers service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates an admin user", async () => {
    const payload = {
      name: "Admin User",
      email: "admin@example.com",
      password: "secure-password",
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(adminUser), { status: 200 }),
    );

    const result = await createAdmin("access-token", payload);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/admin/users",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
    expect(result).toEqual(adminUser);
  });
});
