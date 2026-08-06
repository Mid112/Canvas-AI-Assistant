// Component note: renders reusable error alert UI for the instructor/admin experience.

import { AlertTriangle, CloudOff, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  classifyErrorMessage,
  recoverySuggestionForCategory,
} from "@/lib/error-classification";
import { cn } from "@/lib/utils";
import { instructorSettingsPath } from "@/routes/paths";

interface ErrorAlertProps {
  message: string;
  className?: string;
}

const STYLES = {
  "canvas-auth": {
    icon: ShieldAlert,
    border: "border-amber-300/60",
    bg: "bg-amber-50",
    text: "text-amber-900",
    iconColor: "text-amber-600",
  },
  "canvas-outage": {
    icon: CloudOff,
    border: "border-amber-300/60",
    bg: "bg-amber-50",
    text: "text-amber-900",
    iconColor: "text-amber-600",
  },
  "duplicate-in-flight": {
    icon: AlertTriangle,
    border: "border-amber-300/60",
    bg: "bg-amber-50",
    text: "text-amber-900",
    iconColor: "text-amber-600",
  },
  validation: {
    icon: AlertTriangle,
    border: "border-amber-300/60",
    bg: "bg-amber-50",
    text: "text-amber-900",
    iconColor: "text-amber-600",
  },
  generic: {
    icon: AlertTriangle,
    border: "border-destructive/30",
    bg: "bg-destructive/5",
    text: "text-destructive",
    iconColor: "text-destructive",
  },
} as const;

/** Renders a backend error with a severity-appropriate icon and, when the
 * cause has a known fix (an invalid/expired Canvas token), an inline action
 * to take that fix — instead of every error looking identical regardless of
 * whether it's fixable by the person reading it. */
export function ErrorAlert({ message, className }: ErrorAlertProps) {
  const category = classifyErrorMessage(message);
  const style = STYLES[category];
  const Icon = style.icon;
  const recovery = recoverySuggestionForCategory(category);

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 rounded-lg border px-4 py-3",
        style.border,
        style.bg,
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 size-5 shrink-0", style.iconColor)} aria-hidden="true" />
        <div className="space-y-0.5">
          <p className={cn("text-sm", style.text)}>{message}</p>
          {recovery ? (
            <p className="text-xs text-amber-700">{recovery}</p>
          ) : null}
        </div>
      </div>
      {category === "canvas-auth" ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          render={<Link to={instructorSettingsPath("canvas")} />}
        >
          Reconnect Canvas
        </Button>
      ) : null}
    </div>
  );
}
