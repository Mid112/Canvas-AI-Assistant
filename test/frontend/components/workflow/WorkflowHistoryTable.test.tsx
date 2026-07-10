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
  },
];

describe("WorkflowHistoryTable", () => {
  it("shows undo for reversible approved actions and cancel for pending", async () => {
    const user = userEvent.setup();
    const onCancelPending = vi.fn().mockResolvedValue(undefined);
    const onUndoApproved = vi.fn().mockResolvedValue(undefined);

    render(
      <WorkflowHistoryTable
        entries={entries}
        onCancelPending={onCancelPending}
        onUndoApproved={onUndoApproved}
      />,
    );

    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndoApproved).toHaveBeenCalledWith(entries[0]);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelPending).toHaveBeenCalledWith(entries[1]);
  });

  it("does not offer undo for irreversible approved send_message actions", () => {
    render(
      <WorkflowHistoryTable
        entries={[entries[2]!]}
        onCancelPending={vi.fn()}
        onUndoApproved={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });
});
