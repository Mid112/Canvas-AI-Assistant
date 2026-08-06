import { Calendar, Info, Undo2 } from "lucide-react";
import { useState } from "react";

import { WorkflowStatusBadge } from "@/components/workflow/WorkflowStatusBadge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAuditTimestamp } from "@/lib/format-audit-timestamp";
import type { WorkflowHistoryEntry } from "@/types/workflowHistory";

const EMPTY_ACTING_IDS: ReadonlySet<string> = new Set();

interface WorkflowHistoryTableProps {
  entries: WorkflowHistoryEntry[];
  onCancelPending?: (entry: WorkflowHistoryEntry) => Promise<void>;
  actionError?: string | null;
  actingWorkflowIds?: ReadonlySet<string>;
  onUndo?: (entry: WorkflowHistoryEntry) => void;
}

function canUndo(entry: WorkflowHistoryEntry): boolean {
  return getReversal(entry).available;
}

function getReversal(entry: WorkflowHistoryEntry) {
  return entry.reversal ?? {
    status: entry.undoneAt ? "reversed" : entry.undoable ? "available" : "unavailable",
    available: entry.undoable && entry.status === "approved" && !entry.undoneAt,
    optionLabel: entry.undoable ? "Reverse action" : null,
    warning: entry.undoable ? "Review this reversal before applying it in Canvas." : null,
    unavailableReason: entry.undoable ? null : "This workflow does not support automated reversal.",
    recoveryInstructions: entry.undoable
      ? "Use the reversal option while this workflow remains available."
      : "Apply any needed correction manually in Canvas.",
    resultMessage: entry.undoneAt ? "This workflow was reversed." : null,
    reversedAt: entry.undoneAt,
  };
}

export function WorkflowHistoryTable({
  entries,
  onCancelPending,
  actionError = null,
  actingWorkflowIds = EMPTY_ACTING_IDS,
  onUndo,
}: WorkflowHistoryTableProps) {
  const [localError, setLocalError] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        No workflow history found.
      </div>
    );
  }

  const handleCancel = async (entry: WorkflowHistoryEntry) => {
    if (!onCancelPending) {
      return;
    }
    setLocalError(null);
    try {
      await onCancelPending(entry);
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : "Unable to cancel workflow.",
      );
    }
  };

  return (
    <div className="space-y-2">
      {actionError || localError ? (
        <p role="alert" className="px-4 pt-3 text-sm text-destructive">
          {actionError ?? localError}
        </p>
      ) : null}
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-44">Date & Time</TableHead>
            <TableHead>Workflow Evidence</TableHead>
            <TableHead className="w-36">User</TableHead>
            <TableHead className="w-28 text-center">Status</TableHead>
            <TableHead className="w-32 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => {
            const isActing = actingWorkflowIds.has(entry.id);
            const showCancel = entry.status === "pending" && onCancelPending;
            const showUndo = !showCancel && onUndo && canUndo(entry);
            const reversal = getReversal(entry);

            return (
              <TableRow key={entry.id}>
                <TableCell className="align-top">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar
                      className="size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{formatAuditTimestamp(entry.timestamp)}</span>
                  </div>
                </TableCell>
                <TableCell className="min-w-0 align-top">
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Action
                      </p>
                      <p className="break-words text-sm font-medium">{entry.workflowName}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Prompt
                      </p>
                      <p className="break-words text-sm text-muted-foreground">{entry.prompt}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Affected Resources
                      </p>
                      <p className="break-words text-sm text-muted-foreground">
                        {entry.affectedResourcesSummary}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Reversal
                      </p>
                      <p className="break-words text-sm text-muted-foreground">
                        {reversal.status === "reversed"
                          ? reversal.resultMessage
                          : reversal.available
                            ? reversal.warning
                            : reversal.unavailableReason}
                      </p>
                      {!reversal.available && reversal.status !== "reversed" ? (
                        <p className="mt-1 break-words text-xs text-muted-foreground">
                          {reversal.recoveryInstructions}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="align-top text-sm">{entry.userName}</TableCell>
                <TableCell className="align-top text-center">
                  <WorkflowStatusBadge status={entry.status} />
                </TableCell>
                <TableCell className="align-top text-right">
                  <div className="flex flex-col items-end gap-1">
                    {showCancel ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isActing}
                        onClick={() => void handleCancel(entry)}
                      >
                        {isActing ? "Cancelling..." : "Cancel"}
                      </Button>
                    ) : showUndo ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-primary/40 text-primary hover:bg-primary/10"
                        onClick={() => onUndo(entry)}
                      >
                        <Undo2 className="size-4" aria-hidden="true" />
                        Reverse
                      </Button>
                    ) : (
                      <span className="inline-flex max-w-28 items-center justify-end gap-1 text-xs text-muted-foreground">
                        <Info className="size-3.5 shrink-0" aria-hidden="true" />
                        {reversal.status === "reversed" ? "Reversed" : "Unavailable"}
                      </span>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
