// Auth page note: handles review permissions allowed actions onboarding/authentication UI while keeping Canvas connection steps explicit.

import {
  Check,
  CheckCircle2,
  Eye,
  FileText,
  Mail,
  Upload,
  type LucideIcon,
} from "lucide-react";

interface AllowedAction {
  title: string;
  description: string;
  icon: LucideIcon;
}

const ALLOWED_ACTIONS: AllowedAction[] = [
  {
    title: "View courses",
    description: "Access course list and basic course information",
    icon: Eye,
  },
  {
    title: "View assignments",
    description: "Read assignment details and requirements",
    icon: FileText,
  },
  {
    title: "View submissions",
    description: "Access student submissions and work",
    icon: Upload,
  },
  {
    title: "Draft messages",
    description: "Create message drafts for review before sending",
    icon: Mail,
  },
];

export function ReviewPermissionsAllowedActions() {
  return (
    <section
      aria-labelledby="allowed-actions-heading"
      className="mb-5"
    >
      <div className="mb-3 flex items-center gap-2">
        <CheckCircle2
          className="size-4 text-emerald-600"
          aria-hidden="true"
        />
        <h2
          id="allowed-actions-heading"
          className="text-sm font-semibold text-foreground"
        >
          Allowed Actions
        </h2>
      </div>
      <ul className="space-y-2.5">
        {ALLOWED_ACTIONS.map((action) => (
          <li
            key={action.title}
            className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3"
          >
            <action.icon
              className="size-4 shrink-0 text-emerald-600"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {action.title}
              </p>
              <p className="text-sm text-muted-foreground">{action.description}</p>
            </div>
            <Check
              className="size-4 shrink-0 text-emerald-600"
              aria-hidden="true"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
