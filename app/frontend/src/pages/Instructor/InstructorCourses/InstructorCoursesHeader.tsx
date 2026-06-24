import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useInstitution } from "@/contexts/useInstitution";

export function InstructorCoursesHeader() {
  const { selectedInstitution } = useInstitution();

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
      <Button size="lg">
        <Plus data-icon="inline-start" />
        New Course
      </Button>
    </div>
  );
}
