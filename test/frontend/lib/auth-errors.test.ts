import { describe, expect, it } from "vitest";

import {
  getLoginErrorMessage,
  getRegisterErrorMessage,
} from "@/lib/auth-errors";
import { AuthApiError, GENERIC_AUTH_ERROR_MESSAGE } from "@/services/auth";

describe("getLoginErrorMessage", () => {
  // Verifies: Maps 401 errors to invalid credentials message.
  it("maps 401 errors to invalid credentials message", () => {
    expect(
      getLoginErrorMessage(new AuthApiError("Invalid credentials", 401)),
    ).toBe("Invalid email or password.");
  });

  // Verifies: Maps 403 errors to disabled account message.
  it("maps 403 errors to disabled account message", () => {
    expect(
      getLoginErrorMessage(new AuthApiError("Account is disabled", 403)),
    ).toBe("Account is disabled. Please contact support.");
  });

  // Verifies: Maps 422 errors to validation message.
  it("maps 422 errors to validation message", () => {
    expect(
      getLoginErrorMessage(
        new AuthApiError("Enter a valid email address.", 422),
      ),
    ).toBe("Enter a valid email address.");
  });

  // Verifies: Returns fallback for unknown errors.
  it("returns fallback for unknown errors", () => {
    expect(getLoginErrorMessage(new Error("network"))).toBe(
      "Unable to sign in. Please try again.",
    );
  });
});

describe("getRegisterErrorMessage", () => {
  // Verifies: Returns a duplicate email message for 400 errors.
  it("returns a duplicate email message for 400 errors", () => {
    expect(
      getRegisterErrorMessage(
        new AuthApiError("Email already registered", 400),
      ),
    ).toBe("An account with this email already exists.");
  });

  // Verifies: Maps 422 errors to field-specific validation message.
  it("maps 422 errors to field-specific validation message", () => {
    expect(
      getRegisterErrorMessage(
        new AuthApiError("Enter a valid email address.", 422),
      ),
    ).toBe("Enter a valid email address.");
  });

  // Verifies: Returns a validation message for generic 422 errors.
  it("returns a validation message for generic 422 errors", () => {
    expect(
      getRegisterErrorMessage(
        new AuthApiError(GENERIC_AUTH_ERROR_MESSAGE, 422),
      ),
    ).toBe("Please check your information and try again.");
  });

  it("returns a not found message for 404 errors", () => {
    expect(getRegisterErrorMessage(new AuthApiError("Not Found", 404))).toBe(
      "Something went wrong on our end. Please try again in a moment.",
    );
  });

  it("returns a server error message for 500 errors", () => {
    expect(getRegisterErrorMessage(new AuthApiError("Server error", 500))).toBe(
      "Something went wrong on our end. Please try again in a moment.",
    );
  });

  it("returns the AuthApiError message for other API errors", () => {
    expect(
      getRegisterErrorMessage(new AuthApiError("Custom API error", 403)),
    ).toBe("Custom API error");
  });

  it("returns a network error message when fetch fails", () => {
    expect(getRegisterErrorMessage(new TypeError("Failed to fetch"))).toBe(
      "Can't reach the server right now. Please check your connection and try again.",
    );
  });

  it("returns a generic fallback for unknown errors", () => {
    expect(getRegisterErrorMessage(new Error("Unexpected"))).toBe(
      "Unable to create account. Please try again.",
    );
  });
});
