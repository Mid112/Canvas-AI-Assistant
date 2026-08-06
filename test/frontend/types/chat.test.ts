// Test note: covers the chat.test behavior so future changes can preserve the expected Canvas workflow contract.

import { describe, expect, it } from "vitest";

import { mapWorkflowStatus } from "@/types/chat";

describe("mapWorkflowStatus", () => {
  // Verifies: Regression for a bug where "executing" fell through the
  // default branch to "pending" — reload/refetch would then show a
  // still-running workflow as an open proposal with confirm/cancel
  // controls instead of the "currently running" state.
  it("maps a backend 'executing' status to 'executing', not 'pending'", () => {
    expect(mapWorkflowStatus("executing")).toBe("executing");
  });

  it("maps each settled backend status to its PendingActionStatus", () => {
    expect(mapWorkflowStatus("executed")).toBe("confirmed");
    expect(mapWorkflowStatus("failed")).toBe("failed");
    expect(mapWorkflowStatus("cancelled")).toBe("cancelled");
    expect(mapWorkflowStatus("superseded")).toBe("superseded");
    expect(mapWorkflowStatus("paused")).toBe("paused");
  });

  it("falls back to 'pending' for an open/unstarted or unknown status", () => {
    expect(mapWorkflowStatus("pending")).toBe("pending");
    expect(mapWorkflowStatus(undefined)).toBe("pending");
    expect(mapWorkflowStatus("something-unrecognized")).toBe("pending");
  });
});
