import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { getPasswordRequirements } from "@/lib/validation";

interface PasswordRequirementsChecklistProps {
  password: string;
  /** When omitted, an id is generated from a stable default for aria wiring. */
  id?: string;
  className?: string;
}

/**
 * Progressive password-strength checklist for first-password fields (#1451).
 * Each rule lights up as the typed value meets it.
 */
export function PasswordRequirementsChecklist({
  password,
  id = "password-requirements",
  className,
}: PasswordRequirementsChecklistProps) {
  const requirements = getPasswordRequirements(password);
  const metCount = requirements.filter((requirement) => requirement.met).length;
  const total = requirements.length;
  const progress = (metCount / total) * 100;
  const allMet = metCount === total && password.length > 0;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border/70 bg-gradient-to-b from-card to-secondary/40 shadow-sm",
        "ring-1 ring-black/[0.03] dark:ring-white/[0.04]",
        allMet && "border-emerald-500/35 from-emerald-50/80 to-card dark:from-emerald-950/30",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight text-foreground">
            Password strength
          </p>
          <p className="text-xs text-muted-foreground">
            {allMet
              ? "All requirements met"
              : "Meet each rule below to continue"}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
            allMet
              ? "bg-emerald-600 text-white"
              : "bg-secondary text-secondary-foreground",
          )}
        >
          {metCount}/{total}
        </span>
      </div>

      <div className="px-3.5 pt-3">
        <div
          className="h-1.5 overflow-hidden rounded-full bg-border/70"
          aria-hidden="true"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width,background-color] duration-300 ease-out",
              allMet ? "bg-emerald-500" : "bg-foreground/70",
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <ul
        id={id}
        aria-label="Password requirements"
        className="grid gap-1.5 px-3 py-3 sm:grid-cols-1"
      >
        {requirements.map((requirement) => (
          <li
            key={requirement.id}
            data-requirement={requirement.id}
            data-met={requirement.met ? "true" : "false"}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm transition-colors duration-200",
              requirement.met
                ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-200",
                requirement.met
                  ? "border-emerald-500 bg-emerald-500 text-white"
                  : "border-border bg-card text-transparent",
              )}
              aria-hidden="true"
            >
              <Check className="size-3 stroke-[2.5]" />
            </span>
            <span className={cn(requirement.met && "font-medium")}>
              <span className="sr-only">
                {requirement.met ? "Met: " : "Not met: "}
              </span>
              {requirement.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
