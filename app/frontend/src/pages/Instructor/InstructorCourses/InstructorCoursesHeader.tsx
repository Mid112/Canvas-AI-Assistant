import { Plus, RefreshCw } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { useInstitution } from "@/contexts/useInstitution";
import { useCanvasConnectionUrl } from "@/hooks/useCanvasConnectionUrl";
import { getInstitutionCanvasUrl } from "@/lib/institution-canvas";
import { cn } from "@/lib/utils";

interface InstructorCoursesHeaderProps {
  onRefreshCourses?: () => void;
  isRefreshing?: boolean;
}

export function InstructorCoursesHeader({
  onRefreshCourses,
  isRefreshing = false,
}: InstructorCoursesHeaderProps) {
  const { selectedInstitution } = useInstitution();
  const connectionUrl = useCanvasConnectionUrl();
  const canvasHost =
    connectionUrl ?? getInstitutionCanvasUrl(selectedInstitution.id);
  const newCourseUrl = canvasHost ? `${canvasHost}/courses` : undefined;

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Course Management
        </h1>
        <p className="text-muted-foreground">
          Manage all your courses and track performance at{" "}
          {selectedInstitution.shortName}.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onRefreshCourses ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onRefreshCourses}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={isRefreshing ? "animate-spin" : undefined}
              data-icon="inline-start"
            />
            Sync from Canvas
          </Button>
        ) : null}
        {newCourseUrl ? (
          <a
            href={newCourseUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ size: "lg" }))}
          >
            <Plus data-icon="inline-start" />
            New Course
          </a>
        ) : null}
      </div>
    </div>
  );
}
