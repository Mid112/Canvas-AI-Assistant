import { useMemo, useState } from "react";

import { useInstitution } from "@/contexts/InstitutionContext";
import {
  filterInstructorCourses,
  sortInstructorCourses,
} from "@/pages/Instructor/InstructorCourses/courseUtils";
import { InstructorCoursesHeader } from "@/pages/Instructor/InstructorCourses/InstructorCoursesHeader";
import { InstructorCoursesOverview } from "@/pages/Instructor/InstructorCourses/InstructorCoursesOverview";
import { InstructorCoursesSearch } from "@/pages/Instructor/InstructorCourses/InstructorCoursesSearch";
import {
  InstructorCoursesEmptyState,
  InstructorCoursesSection,
} from "@/pages/Instructor/InstructorCourses/InstructorCoursesSection";
import type { CourseViewMode } from "@/types/course";

export function InstructorCoursesPage() {
  const { courses, analytics } = useInstitution();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<CourseViewMode>("grid");

  const filteredCourses = useMemo(() => {
    const filtered = filterInstructorCourses(courses, search);
    return sortInstructorCourses(filtered);
  }, [courses, search]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <InstructorCoursesHeader />

      <InstructorCoursesSearch search={search} onSearchChange={setSearch} />

      <InstructorCoursesOverview analytics={analytics} />

      {filteredCourses.length === 0 ? (
        <InstructorCoursesEmptyState />
      ) : (
        <InstructorCoursesSection
          courses={filteredCourses}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      )}
    </div>
  );
}
