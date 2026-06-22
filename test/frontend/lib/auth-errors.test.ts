import { describe, expect, it } from "vitest";

import { getRegisterErrorMessage } from "@/lib/auth-errors";
import { AuthApiError } from "@/services/auth";

describe("getRegisterErrorMessage", () => {
  it("returns a duplicate email message for 400 errors", () => {
    expect(
      getRegisterErrorMessage(
        new AuthApiError("Email already registered", 400),
      ),
    ).toBe("An account with this email already exists.");
  });

  it("returns a validation message for 422 errors", () => {
    expect(getRegisterErrorMessage(new AuthApiError("Unprocessable", 422))).toBe(
      "Please check your name, email, and password and try again.",
    );
  });

  it("returns a not found message for 404 errors", () => {
    expect(getRegisterErrorMessage(new AuthApiError("Not Found", 404))).toBe(
      "The server endpoint was not found. Make sure the backend is running.",
    );
  });

  it("returns a server error message for 500 errors", () => {
    expect(getRegisterErrorMessage(new AuthApiError("Server error", 500))).toBe(
      "The server encountered an error. Make sure the database is running.",
    );
  });

  it("returns the AuthApiError message for other API errors", () => {
    expect(
      getRegisterErrorMessage(new AuthApiError("Custom API error", 403)),
    ).toBe("Custom API error");
  });

  it("returns a network error message when fetch fails", () => {
    expect(getRegisterErrorMessage(new TypeError("Failed to fetch"))).toBe(
      "Cannot reach the server. Start the backend with: docker compose -f docker-compose.dev.yml up",
    );
  });

  it("returns a generic fallback for unknown errors", () => {
    expect(getRegisterErrorMessage(new Error("Unexpected"))).toBe(
      "Unable to create account. Please try again.",
    );
  });
});
