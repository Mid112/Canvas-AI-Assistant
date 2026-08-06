// Test note: covers the active course storage.test behavior so future changes can preserve the expected Canvas workflow contract.

import { beforeEach, describe, expect, it } from "vitest";

import {
  getStoredActiveCourseSelection,
  setStoredActiveCourseSelection,
} from "@/lib/active-course-storage";

const SCOPE_ID = "user-42";

describe("active-course-storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips a stored selection with its display name intact", () => {
    setStoredActiveCourseSelection(SCOPE_ID, {
      localId: 351,
      displayName: "COSC 320 - Web Environment",
    });

    expect(getStoredActiveCourseSelection(SCOPE_ID)).toEqual({
      localId: 351,
      displayName: "COSC 320 - Web Environment",
    });
  });

  it("never surfaces the raw local course id as a display name when parsing legacy plain-number storage", () => {
    // Pre-dates the ActiveCourseSelection JSON format, when only the raw
    // local DB id was ever stored as a plain string.
    localStorage.setItem(`canvas-workflow-active-course-${SCOPE_ID}`, "351");

    const selection = getStoredActiveCourseSelection(SCOPE_ID);

    expect(selection?.localId).toBe(351);
    expect(selection?.displayName).not.toContain("351");
  });

  it("clears the stored selection when set to null", () => {
    setStoredActiveCourseSelection(SCOPE_ID, {
      localId: 351,
      displayName: "COSC 320",
    });
    setStoredActiveCourseSelection(SCOPE_ID, null);

    expect(getStoredActiveCourseSelection(SCOPE_ID)).toBeNull();
  });
});
