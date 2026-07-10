import { describe, expect, it } from "vitest";

import { paths } from "@/routes/paths";
import {
  adminNavItems,
  getAssistantPath,
  getDashboardPath,
  getNavItemsForRole,
  getProfilePath,
  getRoleLabel,
  instructorNavItems,
} from "@/utils/navigation";

describe("navigation helpers", () => {
  it("returns instructor navigation items", () => {
    expect(getNavItemsForRole("instructor")).toEqual(instructorNavItems);
    expect(getRoleLabel("instructor")).toBe("Instructor");
    expect(getProfilePath("instructor")).toBe(paths.instructor.profile);
    expect(getDashboardPath("instructor")).toBe(paths.instructor.dashboard);
    expect(getAssistantPath("instructor")).toBe(paths.instructor.assistant);
  });

  it("returns admin navigation items", () => {
    expect(getNavItemsForRole("admin")).toEqual(adminNavItems);
    expect(getRoleLabel("admin")).toBe("Administrator");
    expect(getProfilePath("admin")).toBe(paths.admin.profile);
    expect(getDashboardPath("admin")).toBe(paths.admin.dashboard);
    expect(getAssistantPath("admin")).toBe(paths.admin.dashboard);
  });
});
