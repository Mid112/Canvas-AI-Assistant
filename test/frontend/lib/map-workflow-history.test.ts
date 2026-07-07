import { describe, expect, it } from "vitest";

import { mapWorkflowHistoryApiToEntry } from "@/lib/map-workflow-history";

describe("mapWorkflowHistoryApiToEntry", () => {
  it("maps pending workflows using created_at", () => {
    const entry = mapWorkflowHistoryApiToEntry({
      id: 1,
      conversation_id: 10,
      action_name: "create_assignment",
      user_prompt: "create a midterm exam",
      status: "pending",
      proposed_action: { action: "create_assignment" },
      affected_resources: [],
      created_at: "2026-05-01T12:00:00.000Z",
      executed_at: null,
      user_name: "Dr. Jane Doe",
    });

    expect(entry).toEqual({
      id: "1",
      timestamp: "2026-05-01T12:00:00.000Z",
      actionName: "create_assignment",
      workflowName: "Create Assignment",
      prompt: "create a midterm exam",
      userName: "Dr. Jane Doe",
      status: "pending",
      affectedResources: [],
      affectedResourcesSummary: "None recorded",
    });
  });

  it("maps executed workflows to approved and prefers executed_at", () => {
    const entry = mapWorkflowHistoryApiToEntry({
      id: 2,
      conversation_id: 11,
      action_name: "send_message",
      user_prompt: "remind missing students",
      status: "executed",
      proposed_action: { action: "send_message" },
      affected_resources: [{ type: "course", id: 1, name: "CPSC 310", status: "unchanged" }],
      created_at: "2026-05-01T12:00:00.000Z",
      executed_at: "2026-05-01T12:05:00.000Z",
      user_name: "Dr. Jane Doe",
    });

    expect(entry.status).toBe("approved");
    expect(entry.timestamp).toBe("2026-05-01T12:05:00.000Z");
    expect(entry.workflowName).toBe("Send Reminder Emails");
    expect(entry.affectedResources).toHaveLength(1);
    expect(entry.affectedResourcesSummary).toBe("course: CPSC 310");
  });

  it("maps cancelled and failed workflows to rejected", () => {
    const cancelled = mapWorkflowHistoryApiToEntry({
      id: 3,
      conversation_id: 12,
      action_name: "update_assignment",
      user_prompt: "extend the due date",
      status: "cancelled",
      proposed_action: { action: "update_assignment" },
      affected_resources: [],
      created_at: "2026-05-01T12:00:00.000Z",
      executed_at: null,
      user_name: "Dr. Jane Doe",
    });

    const failed = mapWorkflowHistoryApiToEntry({
      id: 4,
      conversation_id: 13,
      action_name: "create_assignment",
      user_prompt: "create quiz 3",
      status: "failed",
      proposed_action: { action: "create_assignment" },
      affected_resources: [],
      created_at: "2026-05-01T12:00:00.000Z",
      executed_at: null,
      user_name: "Dr. Jane Doe",
    });

    expect(cancelled.status).toBe("rejected");
    expect(failed.status).toBe("rejected");
    expect(cancelled.workflowName).toBe("Update Assignment");
  });
});
