// Test note: covers the workflow history.test behavior so future changes can preserve the expected Canvas workflow contract.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockWorkflowHistory } from "@/data/mockWorkflowHistory";
import { mapWorkflowHistoryApiToEntry } from "@/lib/map-workflow-history";
import {
  buildWorkflowHistoryCsv,
  downloadWorkflowHistoryCsv,
  fetchWorkflowHistory,
  reverseWorkflow,
  undoWorkflow,
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

  // Verifies: Fetches and maps workflow history from the API.
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

  // Verifies: Fetches additional workflow history pages when total exceeds one page.
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

  // Verifies: Maps executed workflows to approved status.
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

  // Verifies: Builds a CSV export with headers and rows.
  it("builds a CSV export with headers and rows", () => {
    const csv = buildWorkflowHistoryCsv(mockWorkflowHistory.slice(0, 2));

    expect(csv).toContain(
      "Date & Time,Action,Prompt,User,Status,Affected Resources",
    );
    expect(csv).toContain("Send Reminder Emails");
    expect(csv).toContain("Create Assignment");
  });

  // Verifies: Undoes a workflow via the undo endpoint and maps the result.
  it("undoes a workflow via the undo endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 5,
          conversation_id: 14,
          action_name: "update_assignment",
          user_prompt: "rename the assignment",
          status: "executed",
          proposed_action: { action: "update_assignment" },
          affected_resources: [],
          created_at: "2026-05-01T12:00:00.000Z",
          executed_at: "2026-05-01T12:05:00.000Z",
          user_name: "Dr. Jane Doe",
          undoable: true,
          undone_at: "2026-05-01T13:00:00.000Z",
        }),
        { status: 200 },
      ),
    );

    const entry = await undoWorkflow("access-token", "5");

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:8000/api/v1${WORKFLOW_HISTORY_PATH}/5/undo`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(entry.undoneAt).toBe("2026-05-01T13:00:00.000Z");
  });

  // Verifies: Undo failures surface the backend's actionable detail text.
  it("surfaces the backend's detail text when undo fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "This action has already been undone." }), {
        status: 409,
      }),
    );

    await expect(undoWorkflow("access-token", "5")).rejects.toThrow(
      "This action has already been undone.",
    );
  });

  // Verifies: Reverses a workflow through the feature-facing reverse endpoint.
  it("reverses a workflow via the reverse endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 6,
          conversation_id: 15,
          action_name: "create_assignment",
          user_prompt: "create lab 1",
          status: "executed",
          proposed_action: { action: "create_assignment" },
          affected_resources: [],
          created_at: "2026-05-01T12:00:00.000Z",
          executed_at: "2026-05-01T12:05:00.000Z",
          user_name: "Dr. Jane Doe",
          undoable: true,
          undone_at: "2026-05-01T13:00:00.000Z",
          reversal: {
            status: "reversed",
            available: false,
            option_label: null,
            warning: null,
            unavailable_reason: "This workflow has already been reversed.",
            recovery_instructions: "Review the reversal audit entry for the Canvas change that was applied.",
            result_message: "The created assignment was deleted from Canvas.",
            reversed_at: "2026-05-01T13:00:00.000Z",
          },
        }),
        { status: 200 },
      ),
    );

    const entry = await reverseWorkflow("access-token", "6");

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:8000/api/v1${WORKFLOW_HISTORY_PATH}/6/reverse`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(entry.reversal?.resultMessage).toBe(
      "The created assignment was deleted from Canvas.",
    );
  });

  // Verifies: Prefixes spreadsheet formula characters in exported values.
  it("prefixes spreadsheet formula characters in exported values", () => {
    const csv = buildWorkflowHistoryCsv([
      {
        ...mockWorkflowHistory[0]!,
        prompt: "=SUM(A1:A10)",
      },
    ]);

    expect(csv).toContain("'=SUM(A1:A10)");
  });

  it("downloads workflow history as csv", () => {
    const click = vi.fn();
    const createObjectURL = vi.fn().mockReturnValue("blob:history");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    const link = {
      href: "",
      download: "",
      click,
      remove: vi.fn(),
    } as unknown as HTMLAnchorElement;
    vi.spyOn(document, "createElement").mockReturnValue(link);
    vi.spyOn(document.body, "appendChild").mockImplementation(() => link);

    downloadWorkflowHistoryCsv(mockWorkflowHistory.slice(0, 1), "history.csv");

    expect(link.download).toBe("history.csv");
    expect(click).toHaveBeenCalledTimes(1);
    expect(link.remove).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:history");
    vi.unstubAllGlobals();
  });
});
