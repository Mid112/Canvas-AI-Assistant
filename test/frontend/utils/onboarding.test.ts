import { describe, expect, it } from "vitest";

import { paths } from "@/routes/paths";
import {
  getPostAuthPath,
  isOnboardingComplete,
  requiresOnboarding,
} from "@/utils/onboarding";

describe("onboarding utils", () => {
  it("does not require onboarding for admins", () => {
    expect(requiresOnboarding("admin")).toBe(false);
    expect(requiresOnboarding("instructor")).toBe(true);
    expect(requiresOnboarding("ta")).toBe(true);
  });

  it("sends admins directly to the admin dashboard", () => {
    expect(
      getPostAuthPath({
        id: 1,
        role: "admin",
        canvas_connections: [],
      }),
    ).toBe(paths.admin.dashboard);
  });

  it("sends instructors without completed onboarding to canvas info", () => {
    expect(
      getPostAuthPath({
        id: 1,
        role: "instructor",
        canvas_connections: [],
      }),
    ).toBe(paths.canvasInfo);
  });

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
});
