import { describe, expect, it } from "vitest";

import { mockWorkflowHistory } from "@/data/mockWorkflowHistory";
import {
  filterWorkflowHistory,
  paginateWorkflowHistory,
  sortWorkflowHistoryByDate,
} from "@/lib/workflow-history-query";
import { emptyWorkflowHistoryFilters } from "@/types/workflowHistory";

describe("filterWorkflowHistory", () => {
  it("returns all entries when filters are empty", () => {
    expect(
      filterWorkflowHistory(mockWorkflowHistory, emptyWorkflowHistoryFilters),
    ).toHaveLength(mockWorkflowHistory.length);
  });

  it("filters by search query across name, description, and user", () => {
    const filtered = filterWorkflowHistory(mockWorkflowHistory, {
      ...emptyWorkflowHistoryFilters,
      search: "Reminder",
    });

    expect(filtered.length).toBeGreaterThan(0);
    expect(
      filtered.every(
        (e) =>
          e.workflowName.includes("Reminder") ||
          e.description.includes("Reminder"),
      ),
    ).toBe(true);
  });

  it("filters by status", () => {
    const filtered = filterWorkflowHistory(mockWorkflowHistory, {
      ...emptyWorkflowHistoryFilters,
      status: "rejected",
    });

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((e) => e.status === "rejected")).toBe(true);
  });

  it("combines search and status filters", () => {
    const filtered = filterWorkflowHistory(mockWorkflowHistory, {
      search: "Reminder",
      status: "approved",
    });

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((e) => e.status === "approved")).toBe(true);
    expect(
      filtered.every(
        (e) =>
          e.workflowName.includes("Reminder") ||
          e.description.includes("Reminder"),
      ),
    ).toBe(true);
  });
});

describe("sortWorkflowHistoryByDate", () => {
  it("sorts entries newest first", () => {
    const sorted = sortWorkflowHistoryByDate(mockWorkflowHistory);
    for (let i = 1; i < sorted.length; i++) {
      expect(
        new Date(sorted[i - 1]!.timestamp).getTime(),
      ).toBeGreaterThanOrEqual(
        new Date(sorted[i]!.timestamp).getTime(),
      );
    }
  });
});

describe("paginateWorkflowHistory", () => {
  it("returns the first page of results", () => {
    const result = paginateWorkflowHistory(mockWorkflowHistory, 1, 3);
    expect(result.items).toHaveLength(3);
    expect(result.page).toBe(1);
    expect(result.startIndex).toBe(1);
    expect(result.endIndex).toBe(3);
  });

  it("returns the final partial page", () => {
    const result = paginateWorkflowHistory(mockWorkflowHistory, 3, 3);
    expect(result.items).toHaveLength(1);
    expect(result.page).toBe(3);
    expect(result.startIndex).toBe(7);
    expect(result.endIndex).toBe(7);
  });
});
