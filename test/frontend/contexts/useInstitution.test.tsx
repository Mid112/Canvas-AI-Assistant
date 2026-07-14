import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useInstitution } from "@/contexts/useInstitution";

describe("useInstitution", () => {
  it("throws when used outside InstitutionProvider", () => {
    expect(() => renderHook(() => useInstitution())).toThrow(
      "useInstitution must be used within an InstitutionProvider",
    );
  });
});
