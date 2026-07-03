import { beforeEach, describe, expect, it } from "vitest";

import { mockWorkflowHistory } from "@/data/mockWorkflowHistory";
import {
  buildWorkflowHistoryCsv,
  fetchWorkflowHistory,
  resetMockWorkflowHistory,
} from "@/services/workflowHistory";

describe("workflowHistory service", () => {
  beforeEach(() => {
    resetMockWorkflowHistory();
  });

  it("returns seeded workflow history entries from the mock API", async () => {
    const entries = await fetchWorkflowHistory();
    expect(entries).toHaveLength(mockWorkflowHistory.length);
    expect(entries[0]?.workflowName).toBe("Send Reminder Emails");
  });

  it("builds a CSV export with headers and rows", () => {
    const csv = buildWorkflowHistoryCsv(mockWorkflowHistory.slice(0, 2));

    expect(csv).toContain(
      "Date & Time,Workflow,Description,User,Status",
    );
    expect(csv).toContain("Send Reminder Emails");
    expect(csv).toContain("Create Assignment");
  });

  it("prefixes spreadsheet formula characters in exported values", () => {
    const csv = buildWorkflowHistoryCsv([
      {
        ...mockWorkflowHistory[0]!,
        description: "=SUM(A1:A10)",
      },
    ]);

    expect(csv).toContain("'=SUM(A1:A10)");
  });

  it("drops invalid entries and keeps valid ones from localStorage", async () => {
    localStorage.setItem(
      "canvas-workflow-instructor-history",
      JSON.stringify([
        mockWorkflowHistory[0],
        {
          ...mockWorkflowHistory[1],
          status: "completed",
        },
      ]),
    );

    const entries = await fetchWorkflowHistory();

    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe(mockWorkflowHistory[0]!.id);
  });

  it("falls back to seed data when all localStorage entries are invalid", async () => {
    localStorage.setItem(
      "canvas-workflow-instructor-history",
      JSON.stringify([
        {
          ...mockWorkflowHistory[0],
          status: "completed",
        },
      ]),
    );

    const entries = await fetchWorkflowHistory();

    expect(entries).toHaveLength(mockWorkflowHistory.length);
    expect(entries[0]?.status).toBe("approved");
  });
});
