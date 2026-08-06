// Test note: covers the workflow history table.test behavior so future changes can preserve the expected Canvas workflow contract.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WorkflowHistoryTable } from "@/components/workflow/WorkflowHistoryTable";
import type { WorkflowHistoryEntry } from "@/types/workflowHistory";

const entries: WorkflowHistoryEntry[] = [
  {
    id: "1",
    timestamp: "2026-07-10T12:00:00.000Z",
    actionName: "create_assignment",
    workflowName: "Create Assignment",
    prompt: "Create quiz 1",
    userName: "Jane",
    status: "approved",
    affectedResources: [],
    affectedResourcesSummary: "assignment: Quiz 1",
    undoable: true,
    undoneAt: null,
  },
  {
    id: "2",
    timestamp: "2026-07-10T11:00:00.000Z",
    actionName: "send_message",
    workflowName: "Send Reminder Emails",
    prompt: "Remind class",
    userName: "Jane",
    status: "pending",
    affectedResources: [],
    affectedResourcesSummary: "announcement: Reminder",
    undoable: false,
    undoneAt: null,
  },
  {
    id: "3",
    timestamp: "2026-07-10T10:00:00.000Z",
    actionName: "send_message",
    workflowName: "Send Reminder Emails",
    prompt: "Announce midterm",
    userName: "Jane",
    status: "approved",
    affectedResources: [],
    affectedResourcesSummary: "announcement: Midterm",
    undoable: false,
    undoneAt: null,
  },
];

function makeEntry(overrides: Partial<WorkflowHistoryEntry> = {}): WorkflowHistoryEntry {
  return {
    id: "wh-1",
    timestamp: "2026-06-01T12:00:00.000Z",
    actionName: "update_assignment",
    workflowName: "Update Assignment",
    prompt: "rename the assignment",
    userName: "Dr. Jane Doe",
    status: "approved",
    affectedResources: [],
    affectedResourcesSummary: "None recorded",
    undoable: true,
    undoneAt: null,
    ...overrides,
  };
}

describe("WorkflowHistoryTable", () => {
  it("shows a cancel action for pending workflows", async () => {
    const user = userEvent.setup();
    const onCancelPending = vi.fn().mockResolvedValue(undefined);

    render(
      <WorkflowHistoryTable
        entries={entries}
        onCancelPending={onCancelPending}
      />,
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelPending).toHaveBeenCalledWith(entries[1]);
  });

  // Verifies: No reversal action is rendered when onUndo is not provided.
  it("does not render a Reverse button when onUndo is omitted", () => {
    render(<WorkflowHistoryTable entries={[makeEntry()]} />);
    expect(screen.queryByRole("button", { name: "Reverse" })).not.toBeInTheDocument();
  });

  // Verifies: Shows the Reverse button for a reversible, executed, not-yet-reversed entry.
  it("shows the Reverse button for a reversible executed entry", () => {
    render(<WorkflowHistoryTable entries={[makeEntry()]} onUndo={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Reverse" })).toBeInTheDocument();
  });

  // Verifies: Hides the Reverse button for a non-reversible action type.
  it("hides the Reverse button for a non-reversible action", () => {
    render(
      <WorkflowHistoryTable
        entries={[makeEntry({ undoable: false, actionName: "send_message", workflowName: "Send Reminder Emails" })]}
        onUndo={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Reverse" })).not.toBeInTheDocument();
  });

  // Verifies: Hides the Reverse button for an entry that isn't in the "approved" (executed) status.
  it("hides the Reverse button for a pending entry", () => {
    render(
      <WorkflowHistoryTable entries={[makeEntry({ status: "pending" })]} onUndo={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: "Reverse" })).not.toBeInTheDocument();
  });

  // Verifies: Hides the Reverse button for an already-reversed entry.
  it("hides the Reverse button for an already-reversed entry", () => {
    render(
      <WorkflowHistoryTable
        entries={[makeEntry({ undoneAt: "2026-06-01T13:00:00.000Z" })]}
        onUndo={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Reverse" })).not.toBeInTheDocument();
  });

  // Verifies: Clicking Reverse calls onUndo with the entry.
  it("calls onUndo with the entry when clicked", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    const entry = makeEntry();
    render(<WorkflowHistoryTable entries={[entry]} onUndo={onUndo} />);

    await user.click(screen.getByRole("button", { name: "Reverse" }));
    expect(onUndo).toHaveBeenCalledWith(entry);
  });
});
