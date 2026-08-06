// Instructor page note: coordinates instructor courses header UI state with Canvas-backed services and active-course context.

import { Plus, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useInstitution } from "@/contexts/useInstitution";
import { CreateCourseDialog } from "@/pages/Instructor/InstructorCourses/CreateCourseDialog";

interface InstructorCoursesHeaderProps {
  onRefreshCourses?: () => void | Promise<void>;
  isRefreshing?: boolean;
}

export function InstructorCoursesHeader({
  onRefreshCourses,
  isRefreshing = false,
}: InstructorCoursesHeaderProps) {
  const { user } = useAuth();
  const { selectedInstitution } = useInstitution();
  const [createOpen, setCreateOpen] = useState(false);
  const canCreateCourse = Boolean(user?.has_canvas_token);

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
            onClick={() => {
              void onRefreshCourses();
            }}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={isRefreshing ? "animate-spin" : undefined}
              data-icon="inline-start"
            />
            Sync from Canvas
          </Button>
        ) : null}
        {canCreateCourse ? (
          <Button
            type="button"
            size="lg"
            onClick={() => setCreateOpen(true)}
          >
            <Plus data-icon="inline-start" />
            New Course
          </Button>
        ) : null}
      </div>

      <CreateCourseDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={onRefreshCourses}
      />
    </div>
  );
}
