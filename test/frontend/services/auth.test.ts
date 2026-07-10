import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthApiError, registerUser } from "@/services/auth";

describe("registerUser validation errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Verifies: Returns a generic message for unrecognized pydantic field errors.
  it("returns a generic message for unrecognized pydantic field errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          detail: [
            {
              loc: ["body", "name"],
              msg: "ensure this value has at most 128 characters",
            },
          ],
        }),
      }),
    );

    await expect(
      registerUser({
        name: "x".repeat(129),
        email: "user@example.com",
        password: "password123",
        terms_accepted: true,
      }),
    ).rejects.toEqual(
      new AuthApiError(
        "Please check your information and try again.",
        422,
      ),
    );
  });

  // Verifies: Maps email validation errors to a user-friendly message.
  it("maps email validation errors to a user-friendly message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          detail: [
            {
              loc: ["body", "email"],
              msg: "value is not a valid email address",
            },
          ],
        }),
      }),
    );

    await expect(
      registerUser({
        name: "Test User",
        email: "not-an-email",
        password: "password123",
        terms_accepted: true,
      }),
    ).rejects.toEqual(
      new AuthApiError("Enter a valid email address.", 422),
    );
  });
});
