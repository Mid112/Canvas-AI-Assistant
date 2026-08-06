// Instructor page note: coordinates instructor submissions analysis header UI state with Canvas-backed services and active-course context.

import { ArrowLeft, Bell, Download } from "lucide-react";
import { Link } from "react-router-dom";

import { Button, buttonVariants } from "@/components/ui/button";
import { formatInstructorCourseTitle } from "@/lib/format-course-title";
import { cn } from "@/lib/utils";
import type { InstructorCourse } from "@/types/course";
import { paths } from "@/routes/paths";

interface InstructorSubmissionsAnalysisHeaderProps {
  course: InstructorCourse;
  onExportReport?: () => void;
  embedded?: boolean;
}

export function InstructorSubmissionsAnalysisHeader({
  course,
  onExportReport,
  embedded = false,
}: InstructorSubmissionsAnalysisHeaderProps) {
  return (
    <div className="space-y-4">
      {embedded ? null : (
        <Link
          to={paths.instructor.courses}
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to Courses
        </Link>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          {embedded ? (
            <h2 className="text-lg font-semibold">Assignment Submission Analytics</h2>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
                Assignment Submission Analytics
              </h1>
              <p className="text-muted-foreground">
                {formatInstructorCourseTitle(course)}
              </p>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="lg" onClick={onExportReport}>
            <Download data-icon="inline-start" />
            Export Report
          </Button>
          <Link
            to={paths.instructor.assistant}
            className={cn(buttonVariants({ size: "lg" }))}
          >
            <Bell data-icon="inline-start" />
            Generate Reminder
          </Link>
        </div>
      </div>
    </div>
  );
}
