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
        className="h-11 flex-1 rounded-lg border-border bg-card text-base font-semibold text-muted-foreground hover:bg-muted"
      >
        Cancel
      </Button>
      <Button
        type="button"
        onClick={onApprove}
        className="h-11 flex-1 rounded-lg bg-primary text-base font-semibold text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90"
      >
        Approve &amp; Continue
      </Button>
    </div>
  );
}
