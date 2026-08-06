// Test note: covers the onboarding storage.test behavior so future changes can preserve the expected Canvas workflow contract.

import { beforeEach, describe, expect, it } from "vitest";

import {
  hasCompletedOnboarding,
  markOnboardingComplete,
} from "@/lib/onboarding-storage";

describe("onboarding-storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // Verifies: Returns false before onboarding is marked complete.
  it("returns false before onboarding is marked complete", () => {
    expect(hasCompletedOnboarding(42)).toBe(false);
  });

  // Verifies: Returns true after onboarding is marked complete.
  it("returns true after onboarding is marked complete", () => {
    markOnboardingComplete(42);

    expect(hasCompletedOnboarding(42)).toBe(true);
    expect(hasCompletedOnboarding(99)).toBe(false);
  });
});
