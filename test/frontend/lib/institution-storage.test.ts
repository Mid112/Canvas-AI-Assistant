import { beforeEach, describe, expect, it } from "vitest";

import {
  clearStoredInstitutionId,
  getInstitutionStorageKey,
  getStoredInstitutionId,
  setStoredInstitutionId,
} from "@/lib/institution-storage";

describe("institution storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // Verifies: Stores and retrieves the selected institution id.
  it("stores and retrieves the selected institution id", () => {
    setStoredInstitutionId(42, "ubco");

    expect(getStoredInstitutionId(42)).toBe("ubco");
    expect(getInstitutionStorageKey(42)).toBe("canvas-workflow-institution-42");
  });

  // Verifies: Clears the stored institution id.
  it("clears the stored institution id", () => {
    setStoredInstitutionId(42, "ubc");
    clearStoredInstitutionId(42);

    expect(getStoredInstitutionId(42)).toBeNull();
  });
});
