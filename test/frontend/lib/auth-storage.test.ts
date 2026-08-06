import { afterEach, describe, expect, it } from "vitest";

import { AUTH_TOKEN_KEY } from "@/config/api";
import {
  clearStoredToken,
  getStoredToken,
  setStoredToken,
} from "@/lib/auth-storage";

describe("auth storage", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("stores, reads, and clears the auth token", () => {
    expect(getStoredToken()).toBeNull();

    setStoredToken("access-token");
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe("access-token");
    expect(getStoredToken()).toBe("access-token");

    clearStoredToken();
    expect(getStoredToken()).toBeNull();
  });
});
