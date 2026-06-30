import { Code2 } from "lucide-react";

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
  return (
    <Card className="shadow-sm ring-1 ring-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Code2 className="size-4 text-emerald-600" aria-hidden="true" />
          Generated Canvas Query
        </CardTitle>
      </CardHeader>
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
    </Card>
  );
}
