// Auth page note: handles canvas info permissions onboarding/authentication UI while keeping Canvas connection steps explicit.

import { Check, Eye } from "lucide-react";

const PERMISSIONS = [
  {
    title: "View Courses",
    description: "Access your course list and basic information.",
  },
  {
    title: "Manage Assignments",
    description: "Create, edit, and organize assignments.",
  },
  {
    title: "Access Grades",
    description: "View and manage student grades.",
  },
  {
    title: "Read Announcements",
    description: "Access course announcements and updates.",
  },
];

export function CanvasInfoPermissions() {
  return (
    <section
      aria-labelledby="requested-permissions-heading"
      className="mb-5 rounded-xl border border-border bg-card px-5 py-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <Eye className="size-4 text-muted-foreground" aria-hidden="true" />
        <h2
          id="requested-permissions-heading"
          className="text-sm font-semibold text-foreground"
        >
          Requested Permissions
        </h2>
      </div>
      <ul className="space-y-3">
        {PERMISSIONS.map((permission) => (
          <li key={permission.title} className="flex items-start gap-2.5">
            <Check
              className="mt-0.5 size-4 shrink-0 text-emerald-600"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {permission.title}
              </p>
              <p className="text-sm text-muted-foreground">{permission.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
