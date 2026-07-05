import { describe, expect, it } from "vitest";

import {
  mapWorkflowHistoryApiToEntry,
  mapWorkflowStatus,
} from "@/lib/map-workflow-history";

describe("mapWorkflowStatus", () => {
  it("maps backend statuses to UI statuses", () => {
    expect(mapWorkflowStatus("executed")).toBe("approved");
    expect(mapWorkflowStatus("cancelled")).toBe("rejected");
    expect(mapWorkflowStatus("failed")).toBe("rejected");
    expect(mapWorkflowStatus("pending")).toBe("pending");
    expect(mapWorkflowStatus("executing")).toBe("pending");
  });
});

describe("mapWorkflowHistoryApiToEntry", () => {
  it("formats action names and maps API records to table entries", () => {
    const entry = mapWorkflowHistoryApiToEntry({
      id: 7,
      conversation_id: 3,
      action_name: "update_assignment",
      user_prompt: "extend the due date",
      status: "failed",
      proposed_action: { action: "update_assignment" },
      created_at: "2026-05-02T10:00:00.000Z",
      executed_at: null,
      user_name: "Dr. Smith",
    });

    expect(entry.id).toBe("7");
    expect(entry.workflowName).toBe("Update Assignment");
    expect(entry.description).toBe("extend the due date");
    expect(entry.userName).toBe("Dr. Smith");
    expect(entry.status).toBe("rejected");
  });
});
