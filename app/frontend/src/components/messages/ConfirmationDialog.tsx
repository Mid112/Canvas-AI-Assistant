import { Loader2 } from "lucide-react";

import { EditableRecipientList } from "@/components/messages/EditableRecipientList";
import { MessageContentPreview } from "@/components/messages/MessagePreview";
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
import type { MessageRecipient } from "@/types/messageDraft";

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipients: MessageRecipient[];
  selectedRecipientIds: ReadonlySet<string>;
  onToggleRecipient: (recipientId: string) => void;
  onRemoveRecipient: (recipientId: string) => void;
  subject: string;
  body: string;
  isSending: boolean;
  onConfirm: () => void;
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  recipients,
  selectedRecipientIds,
  onToggleRecipient,
  onRemoveRecipient,
  subject,
  body,
  isSending,
  onConfirm,
}: ConfirmationDialogProps) {
  const selectedCount = recipients.filter((recipient) =>
    selectedRecipientIds.has(recipient.id),
  ).length;
  const recipientText =
    selectedCount === 1 ? "1 student" : `${selectedCount} students`;
  const deliveryText =
    selectedCount === 0 ? "the whole course as an announcement" : recipientText;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" showCloseButton={!isSending}>
        <DialogHeader>
          <DialogTitle>Send Message?</DialogTitle>
          <DialogDescription>
            Review exactly what will be sent to {deliveryText} before confirming.
            Uncheck or remove anyone who shouldn&apos;t receive a private message.
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            To ({selectedCount} of {recipients.length})
          </p>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-border/60">
            <EditableRecipientList
              recipients={recipients}
              selectedIds={selectedRecipientIds}
              onToggle={onToggleRecipient}
              onRemove={onRemoveRecipient}
              idPrefix="confirm-recipient"
            />
          </div>
        </div>

        <MessageContentPreview subject={subject} body={body} />

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
            disabled={isSending}
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
