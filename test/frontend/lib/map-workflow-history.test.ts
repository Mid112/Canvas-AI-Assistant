// Test note: covers the map workflow history.test behavior so future changes can preserve the expected Canvas workflow contract.

import { describe, expect, it } from "vitest";

import { mapWorkflowHistoryApiToEntry } from "@/lib/map-workflow-history";

describe("mapWorkflowHistoryApiToEntry", () => {
  // Verifies: Maps pending workflows using created_at.
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

    expect(entry).toMatchObject({
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

  // Verifies: Maps executed workflows to approved and prefers executed_at.
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

  // Verifies: Maps cancelled and failed workflows to rejected.
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

  it("maps paused workflows to paused (not pending)", () => {
    const entry = mapWorkflowHistoryApiToEntry({
      id: 7,
      conversation_id: 16,
      action_name: "create_assignment",
      user_prompt: "create a midterm exam",
      status: "paused",
      proposed_action: { action: "create_assignment" },
      affected_resources: [],
      created_at: "2026-05-01T12:00:00.000Z",
      executed_at: null,
      user_name: "Dr. Jane Doe",
    });

    expect(entry.status).toBe("paused");
  });

  // Verifies: Maps undoable/undone_at through to the domain shape.
  it("maps undoable and undone_at through", () => {
    const undoneEntry = mapWorkflowHistoryApiToEntry({
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
    });

    expect(undoneEntry.undoable).toBe(true);
    expect(undoneEntry.undoneAt).toBe("2026-05-01T13:00:00.000Z");
    expect(undoneEntry.reversal?.status).toBe("reversed");

    const notUndoableEntry = mapWorkflowHistoryApiToEntry({
      id: 6,
      conversation_id: 15,
      action_name: "send_message",
      user_prompt: "remind students",
      status: "executed",
      proposed_action: { action: "send_message" },
      affected_resources: [],
      created_at: "2026-05-01T12:00:00.000Z",
      executed_at: "2026-05-01T12:05:00.000Z",
      user_name: "Dr. Jane Doe",
      undoable: false,
      undone_at: null,
    });

    expect(notUndoableEntry.undoable).toBe(false);
    expect(notUndoableEntry.undoneAt).toBeNull();
    expect(notUndoableEntry.reversal?.recoveryInstructions).toBe(
      "Apply any needed correction manually in Canvas.",
    );
  });

  // Verifies: Maps backend reversal metadata into frontend camelCase fields.
  it("maps reversal metadata from the API", () => {
    const entry = mapWorkflowHistoryApiToEntry({
      id: 7,
      conversation_id: 16,
      action_name: "create_assignment",
      user_prompt: "create lab 1",
      status: "executed",
      proposed_action: { action: "create_assignment" },
      affected_resources: [],
      created_at: "2026-05-01T12:00:00.000Z",
      executed_at: "2026-05-01T12:05:00.000Z",
      user_name: "Dr. Jane Doe",
      undoable: true,
      undone_at: null,
      reversal: {
        status: "available",
        available: true,
        option_label: "Delete created assignment",
        warning: "Reversing this workflow deletes the assignment created in Canvas.",
        unavailable_reason: null,
        recovery_instructions: "Use the reversal option to apply the stored rollback through Canvas.",
        result_message: null,
        reversed_at: null,
      },
    });

    expect(entry.reversal?.available).toBe(true);
    expect(entry.reversal?.optionLabel).toBe("Delete created assignment");
    expect(entry.reversal?.recoveryInstructions).toContain("stored rollback");
  });
});
