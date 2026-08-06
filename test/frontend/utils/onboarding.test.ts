// Test note: covers the onboarding.test behavior so future changes can preserve the expected Canvas workflow contract.

import { describe, expect, it } from "vitest";

import { paths } from "@/routes/paths";
import {
  canAccessWithoutOnboarding,
  getPostAuthPath,
  isOnboardingComplete,
  requiresOnboarding,
} from "@/utils/onboarding";

describe("onboarding utils", () => {
  // Verifies: Requires onboarding for instructors only.
  it("requires onboarding for instructors only", () => {
    expect(requiresOnboarding("admin")).toBe(false);
    expect(requiresOnboarding("instructor")).toBe(true);
  });

  // Verifies: Sends admins directly to the admin dashboard.
  it("sends admins directly to the admin dashboard", () => {
    expect(
      getPostAuthPath({
        id: 1,
        role: "admin",
        canvas_connections: [],
      }),
    ).toBe(paths.admin.dashboard);
  });

  // Verifies: Sends instructors without completed onboarding to canvas info.
  it("sends instructors without completed onboarding to canvas info", () => {
    expect(
      getPostAuthPath({
        id: 1,
        role: "instructor",
        canvas_connections: [],
      }),
    ).toBe(paths.canvasInfo);
  });

  // Verifies: Treats users with saved canvas connections as onboarding complete.
  it("treats users with saved canvas connections as onboarding complete", () => {
    expect(
      isOnboardingComplete({
        id: 1,
        canvas_connections: [
          {
            id: 10,
            canvas_url: "https://canvas.university.edu",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    ).toBe(true);
  });

  // Verifies: Only allows onboarding routes before completion.
  it("only allows onboarding routes before completion", () => {
    expect(canAccessWithoutOnboarding(paths.canvasInfo, "instructor")).toBe(true);
    expect(canAccessWithoutOnboarding(paths.connectCanvas, "instructor")).toBe(true);
    expect(canAccessWithoutOnboarding(paths.instructor.dashboard, "instructor")).toBe(
      false,
    );
    expect(canAccessWithoutOnboarding(paths.instructor.assistant, "instructor")).toBe(
      false,
    );
    expect(canAccessWithoutOnboarding(paths.admin.dashboard, "admin")).toBe(true);
  });
});
