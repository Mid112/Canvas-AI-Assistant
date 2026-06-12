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
        className="h-11 w-full rounded-lg bg-[#2563eb] text-base font-semibold text-white shadow-[0_4px_14px_rgba(37,99,235,0.35)] hover:bg-[#1d4ed8]"
      >
        Proceed to Connect
      </Button>
      <p className="text-center text-xs text-[#94a3b8]">
        By connecting, you agree to our{" "}
        <Link
          to="#terms"
          className="font-medium text-[#64748b] hover:text-[#2563eb] hover:underline"
        >
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link
          to="#privacy"
          className="font-medium text-[#64748b] hover:text-[#2563eb] hover:underline"
        >
          Privacy Policy
        </Link>
      </p>
    </div>
  );
}
