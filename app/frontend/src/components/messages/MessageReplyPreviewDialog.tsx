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

interface MessageReplyPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: string | null;
  bodyPreview: string | null;
  recipientCount: number;
  isSending: boolean;
  onConfirm: () => void;
}

export function MessageReplyPreviewDialog({
  open,
  onOpenChange,
  summary,
  bodyPreview,
  recipientCount,
  isSending,
  onConfirm,
}: MessageReplyPreviewDialogProps) {
  const recipientLabel =
    recipientCount === 1 ? "1 student" : `${recipientCount} students`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!isSending}>
        <DialogHeader>
          <DialogTitle>Send this reply?</DialogTitle>
          <DialogDescription>
            {summary ?? "Review the message before it is sent to Canvas."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 rounded-lg border border-border/70 bg-muted/30 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            To {recipientCount > 0 ? recipientLabel : "participants"}
          </p>
          <p className="whitespace-pre-wrap text-sm">{bodyPreview}</p>
        </div>

        <DialogFooter className="sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={isSending}>
            {isSending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Sending...
              </>
            ) : (
              "Confirm & Send"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
