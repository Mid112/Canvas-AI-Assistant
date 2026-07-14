import { Calendar, Undo2 } from "lucide-react";
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
  return entry.undoable && entry.status === "approved" && !entry.undoneAt;
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
      <Table>
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

            return (
              <TableRow key={entry.id}>
                <TableCell>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar
                      className="size-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{formatAuditTimestamp(entry.timestamp)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Action
                      </p>
                      <p className="text-sm font-medium">{entry.workflowName}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Prompt
                      </p>
                      <p className="text-sm text-muted-foreground">{entry.prompt}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase text-muted-foreground">
                        Affected Resources
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {entry.affectedResourcesSummary}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{entry.userName}</TableCell>
                <TableCell className="text-center">
                  <WorkflowStatusBadge status={entry.status} />
                </TableCell>
                <TableCell className="text-right">
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
                        variant="ghost"
                        size="sm"
                        onClick={() => onUndo(entry)}
                      >
                        <Undo2 className="size-4" aria-hidden="true" />
                        Undo
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
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
