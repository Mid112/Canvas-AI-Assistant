import { Calendar } from "lucide-react";

import { WorkflowStatusBadge } from "@/components/workflow/WorkflowStatusBadge";
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

interface WorkflowHistoryTableProps {
  entries: WorkflowHistoryEntry[];
}

export function WorkflowHistoryTable({ entries }: WorkflowHistoryTableProps) {
  if (entries.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        No workflow history found.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-44">Date & Time</TableHead>
          <TableHead>Workflow Evidence</TableHead>
          <TableHead className="w-36">User</TableHead>
          <TableHead className="w-28 text-center">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
