// Preview UI note: presents action type section review details before any Canvas write is confirmed.

import { ChevronDown, Code2 } from "lucide-react";
import { useState } from "react";

import {
  ActionTypeBadge,
  ApiOperationBadge,
} from "@/components/preview/ActionTypeBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DryRunActionType, DryRunApiOperation } from "@/types/dryRunPreview";

interface ActionTypeSectionProps {
  actionType: DryRunActionType;
  apiOperations: DryRunApiOperation[];
}

export function ActionTypeSection({
  actionType,
  apiOperations,
}: ActionTypeSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader className="py-3">
        <button
          type="button"
          className="flex w-full items-center justify-between text-left"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Code2 className="size-4 text-emerald-600" aria-hidden="true" />
            Technical details
          </CardTitle>
          <ChevronDown
            className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </CardHeader>
      {open ? (
        <CardContent className="space-y-4 pt-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Action type:</span>
            <ActionTypeBadge actionType={actionType} />
          </div>
          <p className="text-sm text-[#334155]">
            This workflow will execute the following Canvas API operations:
          </p>
          <div className="flex flex-wrap gap-2">
            {apiOperations.map((operation) => (
              <ApiOperationBadge
                key={`${operation.method}-${operation.endpoint}`}
                method={operation.method}
                endpoint={operation.endpoint}
              />
            ))}
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
