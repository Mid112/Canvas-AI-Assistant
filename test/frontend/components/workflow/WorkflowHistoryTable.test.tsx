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

  // Verifies: No Undo column is rendered at all when onUndo is not provided.
  it("does not render an Undo column when onUndo is omitted", () => {
    render(<WorkflowHistoryTable entries={[makeEntry()]} />);
    expect(screen.queryByRole("columnheader", { name: "Undo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  // Verifies: Shows the Undo button for an undoable, executed, not-yet-undone entry.
  it("shows the Undo button for an undoable executed entry", () => {
    render(<WorkflowHistoryTable entries={[makeEntry()]} onUndo={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  // Verifies: Hides the Undo button for a non-undoable action type.
  it("hides the Undo button for a non-undoable action", () => {
    render(
      <WorkflowHistoryTable
        entries={[makeEntry({ undoable: false, actionName: "send_message", workflowName: "Send Reminder Emails" })]}
        onUndo={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  // Verifies: Hides the Undo button for an entry that isn't in the "approved" (executed) status.
  it("hides the Undo button for a pending entry", () => {
    render(
      <WorkflowHistoryTable entries={[makeEntry({ status: "pending" })]} onUndo={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  // Verifies: Hides the Undo button for an already-undone entry.
  it("hides the Undo button for an already-undone entry", () => {
    render(
      <WorkflowHistoryTable
        entries={[makeEntry({ undoneAt: "2026-06-01T13:00:00.000Z" })]}
        onUndo={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  // Verifies: Clicking Undo calls onUndo with the entry.
  it("calls onUndo with the entry when clicked", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    const entry = makeEntry();
    render(<WorkflowHistoryTable entries={[entry]} onUndo={onUndo} />);

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledWith(entry);
  });
});
