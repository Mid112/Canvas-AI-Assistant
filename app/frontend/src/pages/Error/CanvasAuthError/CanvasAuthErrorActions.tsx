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
        className="h-11 w-full rounded-lg bg-[#2563eb] text-base font-semibold text-white shadow-[0_4px_14px_rgba(37,99,235,0.35)] hover:bg-[#1d4ed8]"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        Retry Connection
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full rounded-lg border-[#e2e8f0] bg-white text-base font-semibold text-[#1e293b] hover:bg-[#f8fafc]"
        render={<a href="mailto:support@institution.edu" />}
      >
        <Mail className="size-4" aria-hidden="true" />
        Contact Administrator
      </Button>
      <button
        type="button"
        onClick={onReturnToLogin}
        className="flex w-full items-center justify-center gap-2 py-2 text-sm font-medium text-[#475569] hover:text-[#1e293b]"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Return to Login
      </button>
    </div>
  );
}

export function CanvasAuthErrorFooter() {
  return (
    <footer className="mt-8 border-t border-[#e2e8f0] pt-6 text-center">
      <p className="text-xs text-[#94a3b8]">
        Need help? Contact your institution&apos;s IT support team
      </p>
    </footer>
  );
}
