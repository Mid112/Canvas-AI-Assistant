import { beforeEach, describe, expect, it } from "vitest";

import {
  getStoredSidebarOpen,
  setStoredSidebarOpen,
} from "@/lib/sidebar-storage";

describe("sidebar storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to open when no preference is stored", () => {
    expect(getStoredSidebarOpen()).toBe(true);
  });

  it("stores and retrieves the sidebar open preference", () => {
    setStoredSidebarOpen(false);

    expect(getStoredSidebarOpen()).toBe(false);
  });
});
