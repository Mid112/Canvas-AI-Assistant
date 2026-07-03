import { ArrowRight, Zap } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { paths } from "@/routes/paths";
import type { InterpretedAction } from "@/types/chat";

interface ActionCardProps {
  action: InterpretedAction;
}

export function ActionCard({ action }: ActionCardProps) {
  const hasLinks = action.primaryLink || action.secondaryLink;

  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Zap className="size-3.5" aria-hidden="true" />
        Interpreted Action
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Action</dt>
          <dd className="font-medium">{action.action}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Course</dt>
          <dd className="font-medium">{action.course}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Affected Students</dt>
          <dd className="font-medium">{action.affectedStudents}</dd>
        </div>
      </dl>

      {hasLinks ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {action.primaryLink ? (
            <Button
              type="button"
              size="sm"
              render={<Link to={action.primaryLink.href} state={{ returnTo: paths.instructor.assistant }} />}
            >
              {action.primaryLink.label}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Button>
          ) : null}
          {action.secondaryLink ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              render={<Link to={action.secondaryLink.href} />}
            >
              {action.secondaryLink.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
