import { Loader2, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dashboardColors } from "@/pages/Instructor/InstructorDashboard/dashboardColors";

interface MessageToolbarProps {
  onCancel: () => void;
  onSend: () => void;
  isSending?: boolean;
  isValid?: boolean;
  hasRecipients?: boolean;
  disabled?: boolean;
}

export function MessageToolbar({
  onCancel,
  onSend,
  isSending = false,
  isValid = true,
  hasRecipients = true,
  disabled = false,
}: MessageToolbarProps) {
  const actionsDisabled = disabled || isSending;

  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Button
        type="button"
        variant="outline"
        onClick={onCancel}
        disabled={actionsDisabled}
      >
        <X className="size-4" aria-hidden="true" />
        Cancel
      </Button>

      <Button
        type="button"
        className={cn(dashboardColors.blue.button)}
        onClick={onSend}
        disabled={actionsDisabled || !isValid || !hasRecipients}
      >
        {isSending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Sending...
          </>
        ) : (
          <>
            <Send className="size-4" aria-hidden="true" />
            Send
          </>
        )}
      </Button>
    </div>
  );
}
