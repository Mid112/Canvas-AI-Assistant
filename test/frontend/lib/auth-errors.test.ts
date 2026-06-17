import { describe, expect, it } from "vitest";

import {
  getLoginErrorMessage,
  getRegisterErrorMessage,
} from "@/lib/auth-errors";
import { AuthApiError } from "@/services/auth";

describe("getLoginErrorMessage", () => {
  it("maps 401 errors to invalid credentials message", () => {
    expect(
      getLoginErrorMessage(new AuthApiError("Invalid credentials", 401)),
    ).toBe("Invalid email or password.");
  });

  it("maps 403 errors to disabled account message", () => {
    expect(
      getLoginErrorMessage(new AuthApiError("Account is disabled", 403)),
    ).toBe("Account is disabled. Please contact support.");
  });

  it("maps 422 errors to validation message", () => {
    expect(
      getLoginErrorMessage(
        new AuthApiError("Enter a valid email address.", 422),
      ),
    ).toBe("Enter a valid email address.");
  });

  it("returns fallback for unknown errors", () => {
    expect(getLoginErrorMessage(new Error("network"))).toBe(
      "Unable to sign in. Please try again.",
    );
  });
});

describe("getRegisterErrorMessage", () => {
  it("maps 400 errors to duplicate email message", () => {
    expect(
      getRegisterErrorMessage(
        new AuthApiError("Email already registered", 400),
      ),
    ).toBe("An account with this email already exists.");
  });

  it("maps 422 errors to validation message", () => {
    expect(
      getRegisterErrorMessage(
        new AuthApiError("Enter a valid email address.", 422),
      ),
    ).toBe("Enter a valid email address.");
  });

  it("returns fallback for unknown errors", () => {
    expect(getRegisterErrorMessage(new Error("network"))).toBe(
      "Unable to create account. Please try again.",
    );
  });
});
