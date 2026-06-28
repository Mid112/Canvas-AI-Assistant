import { ArrowLeft, Bell, Download } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import type { InstructorCourse } from "@/types/course";
import { paths } from "@/routes/paths";

interface InstructorSubmissionsAnalysisHeaderProps {
  course: InstructorCourse;
  onExportReport?: () => void;
}

export function InstructorSubmissionsAnalysisHeader({
  course,
  onExportReport,
}: InstructorSubmissionsAnalysisHeaderProps) {
  return (
    <div className="space-y-4">
      <Link
        to={paths.instructor.courses}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to Courses
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Assignment Submission Analytics
          </h1>
          <p className="text-muted-foreground">
            {course.code}: {course.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="lg" onClick={onExportReport}>
            <Download data-icon="inline-start" />
            Export Report
          </Button>
          <Button
            size="lg"
            render={<Link to={paths.instructor.assistant} />}
          >
            <Bell data-icon="inline-start" />
            Generate Reminder
          </Button>
        </div>
      </div>
    </div>
  );
}
