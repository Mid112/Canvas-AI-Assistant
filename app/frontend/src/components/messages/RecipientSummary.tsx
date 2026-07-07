import { cn } from "@/lib/utils";
import { dashboardColors } from "@/pages/Instructor/InstructorDashboard/dashboardColors";
import type { MessageRecipient } from "@/types/messageDraft";

interface RecipientSummaryProps {
  recipients: MessageRecipient[];
  selectedRecipientIds?: string[];
  onToggleRecipient?: (recipientId: string) => void;
  onSelectAll?: () => void;
}

export function RecipientSummary({
  recipients,
  selectedRecipientIds,
  onToggleRecipient,
  onSelectAll,
}: RecipientSummaryProps) {
  const selectedIds = selectedRecipientIds ?? recipients.map((recipient) => recipient.id);
  const selectedIdSet = new Set(selectedIds);
  const recipientCount = selectedIds.length;
  const hasRecipients = recipients.length > 0;
  const selectedLabel =
    recipientCount === 1
      ? "1 student selected"
      : `${recipientCount} students selected`;
  const allSelected = hasRecipients && recipientCount === recipients.length;

  return (
    <div className="rounded-xl border border-border/60 bg-white shadow-sm ring-1 ring-border/60">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold">Select Students</h2>
        {hasRecipients ? (
          <button
            type="button"
            className={cn("text-xs font-medium", dashboardColors.blue.accent)}
            onClick={onSelectAll}
            disabled={!onSelectAll}
          >
            {allSelected ? "Clear all" : "Select all"}
          </button>
        ) : null}
      </div>

      <div className="max-h-64 overflow-y-auto">
        {!hasRecipients ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No recipients selected. Add students before sending this message.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {recipients.map((recipient) => (
              <li key={recipient.id} className="px-4 py-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 rounded border-border text-primary"
                    checked={selectedIdSet.has(recipient.id)}
                    onChange={() => onToggleRecipient?.(recipient.id)}
                    disabled={!onToggleRecipient}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{recipient.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {recipient.email || "No email available"}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-border/60 px-4 py-3">
        <p className="text-xs text-muted-foreground">{selectedLabel}</p>
      </div>
    </div>
  );
}
