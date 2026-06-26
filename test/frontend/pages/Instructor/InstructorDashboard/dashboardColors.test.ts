import { describe, expect, it } from "vitest";

import {
  formatMissingSubmissionsTrend,
  getMissingSubmissionsTrendClass,
} from "@/pages/Instructor/InstructorDashboard/dashboardColors";

describe("formatMissingSubmissionsTrend", () => {
  it("shows the absolute percentage without a sign", () => {
    expect(formatMissingSubmissionsTrend(5)).toBe("5%");
    expect(formatMissingSubmissionsTrend(-5)).toBe("5%");
  });
});

describe("getMissingSubmissionsTrendClass", () => {
  it("uses red for rising missing submissions and green for improvements", () => {
    expect(getMissingSubmissionsTrendClass(5)).toBe("text-red-500");
    expect(getMissingSubmissionsTrendClass(-5)).toBe("text-emerald-600");
    expect(getMissingSubmissionsTrendClass(0)).toBe("text-muted-foreground");
  });
});
