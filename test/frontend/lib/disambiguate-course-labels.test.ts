// Test note: covers the disambiguate course labels.test behavior so future changes can preserve the expected Canvas workflow contract.

import { describe, expect, it } from "vitest";

import { disambiguateCourseLabels } from "@/lib/disambiguate-course-labels";

describe("disambiguateCourseLabels", () => {
  it("leaves unique course labels untouched", () => {
    const result = disambiguateCourseLabels([
      { id: 1, code: "COSC 310", name: "COSC 310", term: "Fall 2026" },
      { id: 2, code: "COSC 499", name: "COSC 499", term: "Fall 2026" },
    ]);

    expect(result.get(1)).toBe("COSC 310");
    expect(result.get(2)).toBe("COSC 499");
  });

  it("appends the term when two courses share a label but have different terms", () => {
    const result = disambiguateCourseLabels([
      { id: 1, code: "COSC 499", name: "COSC 499", term: "Fall 2026" },
      { id: 2, code: "COSC 499", name: "COSC 499", term: "Winter 2026" },
    ]);

    expect(result.get(1)).toBe("COSC 499 (Fall 2026)");
    expect(result.get(2)).toBe("COSC 499 (Winter 2026)");
  });

  it("never exposes a raw id, adding a position suffix on top when the term also collides", () => {
    // Deliberately large, distinctive ids (unlike an ordinal 1/2) so this
    // test actually proves the id itself never leaks into the label.
    const result = disambiguateCourseLabels([
      { id: 352, code: "COSC 499", name: "COSC 499", term: "Fall 2026" },
      { id: 613, code: "COSC 499", name: "COSC 499", term: "Fall 2026" },
    ]);

    expect(result.get(352)).toBe("COSC 499 (Fall 2026) (1)");
    expect(result.get(613)).toBe("COSC 499 (Fall 2026) (2)");
    expect([...result.values()].some((label) => label.includes("352"))).toBe(
      false,
    );
    expect([...result.values()].some((label) => label.includes("613"))).toBe(
      false,
    );
  });

  it("falls back to a position suffix when colliding courses have no term at all", () => {
    const result = disambiguateCourseLabels([
      { id: 1, code: "COSC 499", name: "COSC 499", term: null },
      { id: 2, code: "COSC 499", name: "COSC 499", term: null },
    ]);

    expect(result.get(1)).toBe("COSC 499 (1)");
    expect(result.get(2)).toBe("COSC 499 (2)");
  });

  it("only disambiguates the colliding subset when three courses share a label but one has a unique term", () => {
    const result = disambiguateCourseLabels([
      { id: 1, code: "COSC 499", name: "COSC 499", term: "Fall 2026" },
      { id: 2, code: "COSC 499", name: "COSC 499", term: "Fall 2026" },
      { id: 3, code: "COSC 499", name: "COSC 499", term: "Winter 2026" },
    ]);

    expect(result.get(1)).toBe("COSC 499 (Fall 2026) (1)");
    expect(result.get(2)).toBe("COSC 499 (Fall 2026) (2)");
    expect(result.get(3)).toBe("COSC 499 (Winter 2026)");
  });
});
