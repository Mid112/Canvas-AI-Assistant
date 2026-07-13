import { Info } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { instructorSettingsPath } from "@/routes/paths";

interface CanvasConnectionBannerProps {
  description?: string;
}

/** Compact, non-blocking variant of CanvasConnectionRequired — shown
 * alongside the chat rather than instead of it, since the assistant can
 * still answer general questions without a connected Canvas account. */
export function CanvasConnectionBanner({
  description = "Connect Canvas to let the assistant work with your courses and assignments. You can still ask general questions.",
}: CanvasConnectionBannerProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2 text-sm">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{description}</span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 border-amber-300 bg-white hover:bg-amber-100"
        render={<Link to={instructorSettingsPath("canvas")} />}
      >
        Connect Canvas
      </Button>
    </div>
  );
}
