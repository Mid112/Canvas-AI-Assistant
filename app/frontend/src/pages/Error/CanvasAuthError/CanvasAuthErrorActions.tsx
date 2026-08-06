// Page note: coordinates the canvas auth error actions screen from smaller components and route-level data.

import { ArrowLeft, Mail, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

interface CanvasAuthErrorActionsProps {
  onRetry: () => void;
  onReturnToLogin: () => void;
}

export function CanvasAuthErrorActions({
  onRetry,
  onReturnToLogin,
}: CanvasAuthErrorActionsProps) {
  return (
    <div className="space-y-3">
      <Button
        type="button"
        onClick={onRetry}
        className="h-11 w-full rounded-lg bg-primary text-base font-semibold text-white shadow-sm shadow-primary/20 hover:bg-primary/90"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        Retry Connection
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full rounded-lg border-border bg-white text-base font-semibold text-foreground hover:bg-muted"
        render={<a href="mailto:support@institution.edu" />}
      >
        <Mail className="size-4" aria-hidden="true" />
        Contact Administrator
      </Button>
      <button
        type="button"
        onClick={onReturnToLogin}
        className="flex w-full items-center justify-center gap-2 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Return to Login
      </button>
    </div>
  );
}

export function CanvasAuthErrorFooter() {
  return (
    <footer className="mt-8 border-t border-border pt-6 text-center">
      <p className="text-xs text-muted-foreground">
        Need help? Contact your institution&apos;s IT support team
      </p>
    </footer>
  );
}
