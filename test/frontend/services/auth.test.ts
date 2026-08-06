import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AuthApiError,
  changeCurrentPassword,
  deleteCurrentUser,
  fetchCurrentUser,
  fetchNotificationSettings,
  fetchSecurityStatus,
  fetchUserSessions,
  loginUser,
  registerUser,
  revokeUserSession,
  updateCurrentUser,
  updateNotificationSettings,
} from "@/services/auth";

vi.mock("@/config/api", () => ({
  API_BASE_URL: "http://localhost:8000/api/v1",
}));

describe("registerUser validation errors", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  // Verifies: Maps password validation errors to a user-friendly message.
  it("maps password validation errors to a user-friendly message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          detail: [
            {
              loc: ["body", "password"],
              msg: "password too short",
            },
          ],
        }),
      }),
    );

    await expect(
      registerUser({
        name: "Test User",
        email: "user@example.com",
        password: "short",
        terms_accepted: true,
      }),
    ).rejects.toEqual(
      new AuthApiError("Please enter a valid password.", 422),
    );
  });
});

describe("auth service requests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("logs in without an authorization header", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "token",
        token_type: "bearer",
      }),
    } as Response);

    const result = await loginUser({
      email: "user@example.com",
      password: "password123",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "user@example.com",
          password: "password123",
        }),
      }),
    );
    expect(result.access_token).toBe("token");
  });

  it("fetches the current user with authorization", async () => {
    const user = {
      id: 1,
      email: "user@example.com",
      name: "Test User",
      role: "instructor",
      is_active: true,
      has_canvas_token: false,
      canvas_connections: [],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => user,
    } as Response);

    const result = await fetchCurrentUser("access-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/auth/me",
      expect.objectContaining({
        method: "GET",
        headers: expect.any(Headers),
      }),
    );
    expect(result).toEqual(user);
  });

  it("updates the current user profile", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1,
        email: "user@example.com",
        name: "Updated User",
        role: "instructor",
        is_active: true,
        has_canvas_token: false,
        canvas_connections: [],
      }),
    } as Response);

    await updateCurrentUser("access-token", { name: "Updated User" });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/auth/me",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Updated User" }),
      }),
    );
  });

  it("deletes the current user on a 204 response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({}),
    } as Response);

    await expect(
      deleteCurrentUser("access-token", "password123"),
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/auth/me",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ password: "password123" }),
      }),
    );
  });

  it("changes the current password with snake_case payload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => ({}),
    } as Response);

    await changeCurrentPassword("access-token", {
      currentPassword: "old-password",
      newPassword: "new-password",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/auth/me/change-password",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          current_password: "old-password",
          new_password: "new-password",
        }),
      }),
    );
  });

  it("fetches and updates notification settings", async () => {
    const settings = { "workflow-approvals": true };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => settings,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => settings,
      } as Response);

    await expect(fetchNotificationSettings("access-token")).resolves.toEqual(
      settings,
    );
    await expect(
      updateNotificationSettings("access-token", settings),
    ).resolves.toEqual(settings);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8000/api/v1/auth/me/notifications",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8000/api/v1/auth/me/notifications",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ settings }),
      }),
    );
  });

  it("fetches sessions and revokes a session", async () => {
    const sessions = [
      {
        id: 1,
        created_at: "2026-06-26T00:00:00.000Z",
        is_current: true,
      },
    ];
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => sessions,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => ({}),
      } as Response);

    await expect(fetchUserSessions("access-token")).resolves.toEqual(sessions);
    await expect(revokeUserSession("access-token", 2)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8000/api/v1/auth/me/sessions",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8000/api/v1/auth/me/sessions/2",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("fetches security status", async () => {
    const status = {
      two_factor_enabled: false,
      active_session_count: 1,
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => status,
    } as Response);

    await expect(fetchSecurityStatus("access-token")).resolves.toEqual(status);
  });

  it("returns a 404-specific error message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ detail: "Not found" }),
    } as Response);

    await expect(loginUser({
      email: "user@example.com",
      password: "password123",
    })).rejects.toEqual(
      new AuthApiError(
        "Something went wrong on our end. Please try again in a moment.",
        404,
      ),
    );
  });

  it("returns a string detail message for auth errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: "Invalid credentials" }),
    } as Response);

    await expect(loginUser({
      email: "user@example.com",
      password: "password123",
    })).rejects.toEqual(
      new AuthApiError("Invalid credentials", 400),
    );
  });

  it("returns a generic message when error JSON parsing fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("invalid json");
      },
    } as Response);

    await expect(loginUser({
      email: "user@example.com",
      password: "password123",
    })).rejects.toEqual(
      new AuthApiError("Something went wrong. Please try again.", 500),
    );
  });
});

describe("password reset API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a password reset token", async () => {
    const { requestPasswordReset } = await import("@/services/auth");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "If an account exists for that email, a password reset was started.",
          reset_token: "tok-123",
        }),
        { status: 200 },
      ),
    );

    await expect(requestPasswordReset("you@university.edu")).resolves.toEqual({
      message: "If an account exists for that email, a password reset was started.",
      reset_token: "tok-123",
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/auth/password-reset/request",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("confirms a password reset", async () => {
    const { confirmPasswordReset } = await import("@/services/auth");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    await expect(
      confirmPasswordReset("tok-123", "newpass123"),
    ).resolves.toBeUndefined();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/auth/password-reset/confirm",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          token: "tok-123",
          new_password: "newpass123",
        }),
      }),
    );
  });
});
