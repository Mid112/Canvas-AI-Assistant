import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { dashboardColors } from "@/pages/Instructor/InstructorDashboard/dashboardColors";

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientCount: number;
  isSending: boolean;
  onConfirm: () => void;
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  recipientCount,
  isSending,
  onConfirm,
}: ConfirmationDialogProps) {
  const recipientText =
    recipientCount === 1 ? "1 student" : `${recipientCount} students`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={!isSending}>
        <DialogHeader>
          <DialogTitle>Send Message?</DialogTitle>
          <DialogDescription>
            You are about to send this message to{" "}
            {recipientCount === 0 ? "no recipients" : recipientText}. This action
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={cn(dashboardColors.blue.button)}
            onClick={onConfirm}
            disabled={isSending || recipientCount === 0}
          >
            {isSending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Sending...
              </>
            ) : (
              "Confirm Send"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
