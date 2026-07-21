import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { instructorSettingsPath } from "@/routes/paths";

interface AssistantLimitedModeBannerProps {
  deferredCount?: number;
  /** When true, copy focuses on resuming after Canvas is already connected. */
  resumeOnly?: boolean;
  onResumeAll?: () => void;
  isResuming?: boolean;
}

export function AssistantLimitedModeBanner({
  deferredCount = 0,
  resumeOnly = false,
  onResumeAll,
  isResuming = false,
}: AssistantLimitedModeBannerProps) {
  return (
    <div
      role="status"
      className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
    >
      <p className="font-medium">
        {resumeOnly ? "Saved assistant requests" : "Limited mode"}
      </p>
      <p className="mt-1 text-muted-foreground">
        {resumeOnly
          ? "Canvas is connected. Resume a saved request to continue where you left off."
          : "General questions work now. Course, assignment, and messaging actions are blocked until Canvas is connected — those requests are saved so you can resume them afterward."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {resumeOnly ? null : (
          <Button render={<Link to={instructorSettingsPath("canvas")} />} size="sm">
            Connect Canvas
          </Button>
        )}
        {deferredCount > 0 && onResumeAll ? (
          <Button
            type="button"
            variant={resumeOnly ? "default" : "outline"}
            size="sm"
            disabled={isResuming}
            onClick={onResumeAll}
          >
            {isResuming
              ? "Preparing…"
              : `Resume ${deferredCount} saved request${deferredCount === 1 ? "" : "s"}`}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

