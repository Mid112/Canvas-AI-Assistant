// Auth page note: handles canvas info actions onboarding/authentication UI while keeping Canvas connection steps explicit.

import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

interface CanvasInfoActionsProps {
  onProceed: () => void;
}

export function CanvasInfoActions({ onProceed }: CanvasInfoActionsProps) {
  return (
    <div className="space-y-4">
      <Button
        type="button"
        onClick={onProceed}
        className="h-11 w-full rounded-lg bg-primary text-base font-semibold text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90"
      >
        Proceed to Connect
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        By connecting, you agree to our{" "}
        <Link
          to="#terms"
          className="font-medium text-muted-foreground hover:text-primary hover:underline"
        >
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link
          to="#privacy"
          className="font-medium text-muted-foreground hover:text-primary hover:underline"
        >
          Privacy Policy
        </Link>
      </p>
    </div>
  );
}
