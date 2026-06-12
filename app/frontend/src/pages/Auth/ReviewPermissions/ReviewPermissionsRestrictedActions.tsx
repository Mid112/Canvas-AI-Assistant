import {
  BarChart3,
  CircleX,
  Send,
  type LucideIcon,
} from "lucide-react";

interface RestrictedAction {
  title: string;
  description: string;
  icon: LucideIcon;
}

const RESTRICTED_ACTIONS: RestrictedAction[] = [
  {
    title: "Modify grades",
    description: "Direct grade changes require manual approval",
    icon: BarChart3,
  },
  {
    title: "Publish assignments automatically",
    description: "Assignment publishing requires manual confirmation",
    icon: Send,
  },
];

export function ReviewPermissionsRestrictedActions() {
  return (
    <section
      aria-labelledby="restricted-actions-heading"
      className="mb-5"
    >
      <div className="mb-3 flex items-center gap-2">
        <CircleX className="size-4 text-[#dc2626]" aria-hidden="true" />
        <h2
          id="restricted-actions-heading"
          className="text-sm font-semibold text-[#1e293b]"
        >
          Restricted Actions
        </h2>
      </div>
      <ul className="space-y-2.5">
        {RESTRICTED_ACTIONS.map((action) => (
          <li
            key={action.title}
            className="flex items-center gap-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3"
          >
            <action.icon
              className="size-4 shrink-0 text-[#dc2626]"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#1e293b]">
                {action.title}
              </p>
              <p className="text-sm text-[#64748b]">{action.description}</p>
            </div>
            <CircleX
              className="size-4 shrink-0 text-[#dc2626]"
              aria-hidden="true"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
