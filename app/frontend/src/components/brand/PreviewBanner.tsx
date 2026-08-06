// Component note: renders reusable preview banner UI for the instructor/admin experience.

import { Eye } from "lucide-react";

import { cn } from "@/lib/utils";

interface PreviewBannerProps {
  title?: string;
  description?: string;
  className?: string;
}

export function PreviewBanner({
  title = "Action preview required",
  description = "Review the proposed Canvas changes below. Nothing will be published until you approve.",
  className,
}: PreviewBannerProps) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-md border border-border bg-muted/50 px-4 py-3",
        className,
      )}
      role="status"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Eye className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
