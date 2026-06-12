import { beforeEach, describe, expect, it } from "vitest";

import {
  hasCompletedOnboarding,
  markOnboardingComplete,
} from "@/lib/onboarding-storage";

describe("onboarding-storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns false before onboarding is marked complete", () => {
    expect(hasCompletedOnboarding(42)).toBe(false);
  });

  it("returns true after onboarding is marked complete", () => {
    markOnboardingComplete(42);

    expect(hasCompletedOnboarding(42)).toBe(true);
    expect(hasCompletedOnboarding(99)).toBe(false);
  });
});
