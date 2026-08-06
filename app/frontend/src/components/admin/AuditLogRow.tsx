// Admin UI note: presents audit log row controls for institution/admin workflows with service-backed state.

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

import { AuditLogActionBadge } from "@/components/admin/AuditLogActionBadge";
import { AuditLogResultBadge } from "@/components/admin/AuditLogResultBadge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatAuditTimestamp } from "@/lib/format-audit-timestamp";
import { formatAuditLogUserRole } from "@/lib/map-audit-log";
import type { AuditLogEntry } from "@/types/auditLog";

interface AuditLogRowProps {
  log: AuditLogEntry;
}

function formatDetailValue(value: string | number | boolean | null): string {
  if (value === null) {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

export function AuditLogRow({ log }: AuditLogRowProps) {
  const [expanded, setExpanded] = useState(false);
  const detailEntries = Object.entries(log.details);
  const panelId = `audit-log-details-${log.id}`;

  return (
    <>
      <TableRow data-state={expanded ? "expanded" : undefined}>
        <TableCell className="w-10">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-expanded={expanded}
            aria-controls={panelId}
            aria-label={
              expanded
                ? `Collapse details for ${log.action}`
                : `Expand details for ${log.action}`
            }
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? (
              <ChevronDown className="size-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-4" aria-hidden="true" />
            )}
          </Button>
        </TableCell>
        <TableCell className="whitespace-nowrap text-muted-foreground">
          {formatAuditTimestamp(log.timestamp)}
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{log.userEmail}</span>
            <span className="text-xs text-muted-foreground">
              {formatAuditLogUserRole(log.userRole)}
            </span>
          </div>
        </TableCell>
        <TableCell>
          <AuditLogActionBadge action={log.action} />
        </TableCell>
        <TableCell className="text-muted-foreground">{log.resource}</TableCell>
        <TableCell>
          <AuditLogResultBadge result={log.result} />
        </TableCell>
      </TableRow>

      {expanded ? (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30 p-0">
            <div
              id={panelId}
              className="border-t px-4 py-3 text-sm"
              role="region"
              aria-label={`Details for ${log.action}`}
            >
              {detailEntries.length === 0 ? (
                <p className="text-muted-foreground">No additional details.</p>
              ) : (
                <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {detailEntries.map(([key, value]) => (
                    <div key={key} className="min-w-0">
                      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {key.replace(/([A-Z])/g, " $1").trim()}
                      </dt>
                      <dd className="mt-0.5 break-words text-foreground">
                        {formatDetailValue(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}
