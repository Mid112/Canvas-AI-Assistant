import { describe, expect, it } from "vitest";

import { paths } from "@/routes/paths";
import {
  getPostAuthPath,
  requiresOnboarding,
} from "@/utils/onboarding";

describe("onboarding utils", () => {
  it("requires onboarding for instructors only", () => {
    expect(requiresOnboarding("admin")).toBe(false);
    expect(requiresOnboarding("instructor")).toBe(true);
  });

  it("sends admins directly to the admin dashboard", () => {
    expect(getPostAuthPath(1, "admin")).toBe(paths.admin.dashboard);
  });

  it("sends instructors without completed onboarding to canvas info", () => {
    expect(getPostAuthPath(1, "instructor")).toBe(paths.canvasInfo);
  });
});
