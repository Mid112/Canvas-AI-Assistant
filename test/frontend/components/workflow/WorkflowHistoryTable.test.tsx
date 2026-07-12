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

  it("does not offer an undo action for executed (approved) workflows", () => {
    // Undo is intentionally not exposed: there is no backend endpoint to
    // reverse an executed Canvas action, so the UI must not imply otherwise.
    render(
      <WorkflowHistoryTable
        entries={[entries[0]!, entries[2]!]}
        onCancelPending={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });
});
