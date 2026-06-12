import { Button } from "@/components/ui/button";

interface ReviewPermissionsActionsProps {
  onCancel: () => void;
  onApprove: () => void;
}

export function ReviewPermissionsActions({
  onCancel,
  onApprove,
}: ReviewPermissionsActionsProps) {
  return (
    <div className="flex gap-3">
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        className="h-11 flex-1 rounded-lg border-[#e2e8f0] bg-white text-base font-semibold text-[#475569] hover:bg-[#f8fafc]"
      >
        Cancel
      </Button>
      <Button
        type="button"
        onClick={onApprove}
        className="h-11 flex-1 rounded-lg bg-[#2563eb] text-base font-semibold text-white shadow-[0_4px_14px_rgba(37,99,235,0.35)] hover:bg-[#1d4ed8]"
      >
        Approve &amp; Continue
      </Button>
    </div>
  );
}
