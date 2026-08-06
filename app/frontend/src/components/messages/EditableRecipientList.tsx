// Messages UI note: supports the instructor message-drafting flow for editable recipient list without bypassing preview/confirmation.

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MessageRecipient } from "@/types/messageDraft";

interface EditableRecipientListProps {
  recipients: MessageRecipient[];
  selectedIds: ReadonlySet<string>;
  onToggle: (recipientId: string) => void;
  onRemove: (recipientId: string) => void;
  emptyMessage?: string;
  className?: string;
  idPrefix?: string;
}

export function EditableRecipientList({
  recipients,
  selectedIds,
  onToggle,
  onRemove,
  emptyMessage = "No recipients selected. Add students before sending this message.",
  className,
  idPrefix = "recipient",
}: EditableRecipientListProps) {
  if (recipients.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className={cn("divide-y divide-border/60", className)}>
      {recipients.map((recipient) => {
        const isSelected = selectedIds.has(recipient.id);
        const checkboxId = `${idPrefix}-${recipient.id}`;

        return (
          <li key={recipient.id} className="flex items-center gap-3 px-4 py-3">
            <input
              id={checkboxId}
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggle(recipient.id)}
              className="size-4 shrink-0 rounded border-border/60 text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
            <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer">
              <p
                className={cn(
                  "text-sm font-medium",
                  !isSelected && "text-muted-foreground line-through",
                )}
              >
                {recipient.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {recipient.email || "No email on file"}
              </p>
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label={`Remove ${recipient.name}`}
              onClick={() => onRemove(recipient.id)}
            >
              <X className="size-3.5" aria-hidden="true" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
