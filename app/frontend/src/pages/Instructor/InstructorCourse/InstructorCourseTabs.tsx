import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";
import {
  instructorCourseAnalyticsPath,
  instructorCourseAssignmentsPath,
  instructorCourseMessagesPath,
  instructorCoursePath,
  instructorCourseStudentsPath,
} from "@/routes/paths";

const TAB_CLASS =
  "inline-flex items-center justify-center border-b-2 border-transparent px-1 pb-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";

interface InstructorCourseTabsProps {
  localCourseId: number;
}

export function InstructorCourseTabs({ localCourseId }: InstructorCourseTabsProps) {
  const tabs = [
    { label: "Overview", to: instructorCoursePath(localCourseId), end: true },
    {
      label: "Assignments",
      to: instructorCourseAssignmentsPath(localCourseId),
      end: false,
    },
    {
      label: "Students",
      to: instructorCourseStudentsPath(localCourseId),
      end: false,
    },
    {
      label: "Analytics",
      to: instructorCourseAnalyticsPath(localCourseId),
      end: false,
    },
    {
      label: "Messages",
      to: instructorCourseMessagesPath(localCourseId),
      end: false,
    },
  ] as const;

  return (
    <nav aria-label="Course sections" className="border-b border-border/60">
      <ul className="-mb-px flex flex-wrap gap-6">
        {tabs.map((tab) => (
          <li key={tab.label}>
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  TAB_CLASS,
                  isActive && "border-primary text-primary",
                )
              }
            >
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
