import { describe, expect, it } from "vitest";

import {
  formatAnalyticsTrend,
  getTrendColorClass,
  getTrendDirection,
} from "@/lib/analytics-trends";

describe("formatAnalyticsTrend", () => {
  it("prefixes positive values with a plus sign", () => {
    expect(formatAnalyticsTrend(5)).toBe("+5%");
  });

  it("formats negative and zero values without a plus sign", () => {
    expect(formatAnalyticsTrend(-2)).toBe("-2%");
    expect(formatAnalyticsTrend(0)).toBe("0%");
  });
});

describe("getTrendDirection", () => {
  it("treats positive values as positive for standard metrics", () => {
    expect(getTrendDirection(3)).toBe("positive");
  });

  it("treats negative values as negative for standard metrics", () => {
    expect(getTrendDirection(-3)).toBe("negative");
  });

  it("inverts direction for at-risk style metrics", () => {
    expect(getTrendDirection(3, true)).toBe("negative");
    expect(getTrendDirection(-3, true)).toBe("positive");
  });

  it("returns neutral for zero", () => {
    expect(getTrendDirection(0)).toBe("neutral");
    expect(getTrendDirection(0, true)).toBe("neutral");
  });
});

describe("getTrendColorClass", () => {
  it("maps directions to semantic color classes", () => {
    expect(getTrendColorClass("positive")).toBe("text-emerald-600");
    expect(getTrendColorClass("negative")).toBe("text-destructive");
    expect(getTrendColorClass("neutral")).toBe("text-muted-foreground");
  });
});
