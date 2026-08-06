// Auth page note: handles password mismatch alert onboarding/authentication UI while keeping Canvas connection steps explicit.

import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface PasswordMismatchAlertProps {
  id: string;
  className?: string;
}

/**
 * High-visibility mismatch notice for confirm-password fields (#1451).
 */
export function PasswordMismatchAlert({
  id,
  className,
}: PasswordMismatchAlertProps) {
  return (
    <div
      id={id}
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-red-600/40 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-900 shadow-sm",
        "dark:border-red-400/40 dark:bg-red-950/50 dark:text-red-50",
        className,
      )}
    >
      <AlertTriangle
        className="mt-0.5 size-4 shrink-0 text-red-700 dark:text-red-300"
        aria-hidden="true"
      />
      <span>Confirm password must match the password above</span>
    </div>
  );
}

interface PasswordMatchStatusProps {
  id: string;
  className?: string;
}

/** Positive confirm-password feedback when both fields match. */
export function PasswordMatchStatus({
  id,
  className,
}: PasswordMatchStatusProps) {
  return (
    <p
      id={id}
      role="status"
      aria-label="Password confirmation"
      className={cn(
        "flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300",
        className,
      )}
    >
      <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
      Passwords match
    </p>
  );
}
