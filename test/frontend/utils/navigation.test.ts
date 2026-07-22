import { describe, expect, it } from "vitest";

import { paths } from "@/routes/paths";
import {
  adminNavItems,
  decorateNavItemsWithHealth,
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

  it("includes a System Health nav entry pointing at the health dashboard", () => {
    const systemHealthItem = adminNavItems.find(
      (item) => item.title === "System Health",
    );
    expect(systemHealthItem).toBeDefined();
    expect(systemHealthItem?.href).toBe(paths.admin.systemHealth);
  });
});

describe("decorateNavItemsWithHealth", () => {
  it("returns the items unchanged when status is healthy", () => {
    const result = decorateNavItemsWithHealth(adminNavItems, "healthy");
    expect(result).toEqual(adminNavItems);
  });

  it("returns the items unchanged when status is undefined", () => {
    const result = decorateNavItemsWithHealth(adminNavItems, undefined);
    expect(result).toEqual(adminNavItems);
  });

  it("sets the badge only on the System Health entry when degraded", () => {
    const result = decorateNavItemsWithHealth(adminNavItems, "degraded");

    const systemHealthItem = result.find((item) => item.href === paths.admin.systemHealth);
    expect(systemHealthItem?.badge).toBe("degraded");

    const otherItems = result.filter((item) => item.href !== paths.admin.systemHealth);
    expect(otherItems.every((item) => item.badge === undefined)).toBe(true);
  });

  it("sets the badge to down", () => {
    const result = decorateNavItemsWithHealth(adminNavItems, "down");
    const systemHealthItem = result.find((item) => item.href === paths.admin.systemHealth);
    expect(systemHealthItem?.badge).toBe("down");
  });

  it("does not mutate the original array", () => {
    const original = [...adminNavItems];
    decorateNavItemsWithHealth(adminNavItems, "down");
    expect(adminNavItems).toEqual(original);
  });

  it("returns the items unchanged when status is unknown (never checked)", () => {
    // "unknown" (nothing checked yet) is not a confirmed problem, so it
    // must render calm like "healthy"/undefined -- not a false alarm.
    const result = decorateNavItemsWithHealth(adminNavItems, "unknown");
    expect(result).toEqual(adminNavItems);
  });
});
