// Test note: covers the sidebar storage.test behavior so future changes can preserve the expected Canvas workflow contract.

import { beforeEach, describe, expect, it } from "vitest";

import {
  getStoredSidebarOpen,
  setStoredSidebarOpen,
} from "@/lib/sidebar-storage";

describe("sidebar storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // Verifies: Defaults to open when no preference is stored.
  it("defaults to open when no preference is stored", () => {
    expect(getStoredSidebarOpen()).toBe(true);
  });

  // Verifies: Stores and retrieves the sidebar open preference.
  it("stores and retrieves the sidebar open preference", () => {
    setStoredSidebarOpen(false);

    expect(getStoredSidebarOpen()).toBe(false);
  });
});
