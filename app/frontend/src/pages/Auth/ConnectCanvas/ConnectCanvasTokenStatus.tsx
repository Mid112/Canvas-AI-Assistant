// Auth page note: handles connect canvas token status onboarding/authentication UI while keeping Canvas connection steps explicit.

import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";

import type { CanvasTokenValidationStatus } from "@/types/canvas";

export type TokenValidationState =
  | { status: "idle" }
  | { status: "validating" }
  | { status: CanvasTokenValidationStatus };

interface ConnectCanvasTokenStatusProps {
  validation: TokenValidationState;
}

const statusConfig = {
  validating: {
    className: "text-muted-foreground",
    icon: LoaderCircle,
    message: "Checking token...",
    spin: true,
  },
  valid: {
    className: "text-emerald-600",
    icon: CheckCircle2,
    message: "Token is valid",
    spin: false,
  },
  expired: {
    className: "text-destructive",
    icon: AlertCircle,
    message: "Token has expired",
    spin: false,
  },
  invalid: {
    className: "text-destructive",
    icon: AlertCircle,
    message: "Token is invalid",
    spin: false,
  },
} as const;

export function ConnectCanvasTokenStatus({
  validation,
}: ConnectCanvasTokenStatusProps) {
  if (validation.status === "idle") {
    return null;
  }

  const config = statusConfig[validation.status];
  const Icon = config.icon;

  return (
    <p
      className={`flex items-center gap-1.5 text-sm ${config.className}`}
      role="status"
      aria-live="polite"
    >
      <Icon
        className={`size-4 shrink-0 ${config.spin ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      {config.message}
    </p>
  );
}
