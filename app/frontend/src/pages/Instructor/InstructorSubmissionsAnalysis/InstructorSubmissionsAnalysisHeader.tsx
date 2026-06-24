import { Bell, Download } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useInstitution } from "@/contexts/useInstitution";
import { paths } from "@/routes/paths";

interface InstructorSubmissionsAnalysisHeaderProps {
  onExportReport?: () => void;
}

export function InstructorSubmissionsAnalysisHeader({
  onExportReport,
}: InstructorSubmissionsAnalysisHeaderProps) {
  const { selectedInstitution } = useInstitution();

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Missing Submissions Analysis
        </h1>
        <p className="text-muted-foreground">
          Track and manage incomplete assignments at{" "}
          {selectedInstitution.shortName}.
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
  );
}
