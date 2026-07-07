import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockWorkflowHistory } from "@/data/mockWorkflowHistory";
import { mapWorkflowHistoryApiToEntry } from "@/lib/map-workflow-history";
import {
  buildWorkflowHistoryCsv,
  fetchWorkflowHistory,
  WORKFLOW_HISTORY_PATH,
} from "@/services/workflowHistory";
import type { WorkflowHistoryApiResponse } from "@/types/workflowHistory";

vi.mock("@/config/api", () => ({
  API_BASE_URL: "http://localhost:8000/api/v1",
}));

describe("workflowHistory service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and maps workflow history from the API", async () => {
    const apiResponse: WorkflowHistoryApiResponse = {
      total: 1,
      items: [
        {
          id: 1,
          conversation_id: 10,
          action_name: "create_assignment",
          user_prompt: "create a midterm exam",
          status: "pending",
          proposed_action: {
            action: "create_assignment",
            title: "Midterm Exam",
          },
          affected_resources: [
            { type: "course", id: 1, name: "CPSC 310", status: "unchanged" },
            {
              type: "assignment",
              id: null,
              name: "Midterm Exam",
              status: "created",
            },
          ],
          created_at: "2026-05-01T12:00:00.000Z",
          executed_at: null,
          user_name: "Dr. Jane Doe",
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(apiResponse), { status: 200 }),
    );

    const result = await fetchWorkflowHistory("access-token");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `http://localhost:8000/api/v1${WORKFLOW_HISTORY_PATH}?limit=200&offset=0`,
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(result.entries).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.entries[0]?.workflowName).toBe("Create Assignment");
    expect(result.entries[0]?.prompt).toBe("create a midterm exam");
    expect(result.entries[0]?.status).toBe("pending");
    expect(result.entries[0]?.affectedResources).toHaveLength(2);
  });

  it("fetches additional workflow history pages when total exceeds one page", async () => {
    const firstPage: WorkflowHistoryApiResponse = {
      total: 2,
      items: [
        {
          id: 1,
          conversation_id: 10,
          action_name: "create_assignment",
          user_prompt: "first",
          status: "pending",
          proposed_action: { action: "create_assignment" },
          affected_resources: [],
          created_at: "2026-05-01T12:00:00.000Z",
          executed_at: null,
          user_name: "Dr. Jane Doe",
        },
      ],
    };
    const secondPage: WorkflowHistoryApiResponse = {
      total: 2,
      items: [
        {
          id: 2,
          conversation_id: 11,
          action_name: "send_message",
          user_prompt: "second",
          status: "executed",
          proposed_action: { action: "send_message" },
          affected_resources: [],
          created_at: "2026-05-02T12:00:00.000Z",
          executed_at: "2026-05-02T12:05:00.000Z",
          user_name: "Dr. Jane Doe",
        },
      ],
    };

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify(firstPage), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(secondPage), { status: 200 }),
      );

    const result = await fetchWorkflowHistory("access-token");

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(result.entries).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it("maps executed workflows to approved status", () => {
    const entry = mapWorkflowHistoryApiToEntry({
      id: 2,
      conversation_id: 11,
      action_name: "send_message",
      user_prompt: "remind missing students",
      status: "executed",
      proposed_action: { action: "send_message" },
      affected_resources: [
        { type: "course", id: 1, name: "CPSC 310", status: "unchanged" },
      ],
      created_at: "2026-05-01T12:00:00.000Z",
      executed_at: "2026-05-01T12:05:00.000Z",
      user_name: "Dr. Jane Doe",
    });

    expect(entry.status).toBe("approved");
    expect(entry.timestamp).toBe("2026-05-01T12:05:00.000Z");
  });

  it("builds a CSV export with headers and rows", () => {
    const csv = buildWorkflowHistoryCsv(mockWorkflowHistory.slice(0, 2));

    expect(csv).toContain(
      "Date & Time,Action,Prompt,User,Status,Affected Resources",
    );
    expect(csv).toContain("Send Reminder Emails");
    expect(csv).toContain("Create Assignment");
  });

  it("prefixes spreadsheet formula characters in exported values", () => {
    const csv = buildWorkflowHistoryCsv([
      {
        ...mockWorkflowHistory[0]!,
        prompt: "=SUM(A1:A10)",
      },
    ]);

    expect(csv).toContain("'=SUM(A1:A10)");
  });
});
