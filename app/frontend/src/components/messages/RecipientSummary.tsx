// Messages UI note: supports the instructor message-drafting flow for recipient summary without bypassing preview/confirmation.

import { EditableRecipientList } from "@/components/messages/EditableRecipientList";
import { cn } from "@/lib/utils";
import { dashboardColors } from "@/pages/Instructor/InstructorDashboard/dashboardColors";
import type { MessageRecipient } from "@/types/messageDraft";

interface RecipientSummaryProps {
  recipients: MessageRecipient[];
  selectedIds: ReadonlySet<string>;
  onToggle: (recipientId: string) => void;
  onRemove: (recipientId: string) => void;
  onSelectAll?: () => void;
}

export function RecipientSummary({
  recipients,
  selectedIds,
  onToggle,
  onRemove,
  onSelectAll,
}: RecipientSummaryProps) {
  const totalCount = recipients.length;
  const selectedCount = recipients.filter((recipient) =>
    selectedIds.has(recipient.id),
  ).length;
  const allSelected = totalCount > 0 && selectedCount === totalCount;

  return (
    <div className="rounded-xl border border-border/60 bg-white shadow-sm ring-1 ring-border/60">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold">Select Students</h2>
        {totalCount > 0 ? (
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
        <EditableRecipientList
          recipients={recipients}
          selectedIds={selectedIds}
          onToggle={onToggle}
          onRemove={onRemove}
        />
      </div>

      <div className="border-t border-border/60 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {selectedCount === 0
            ? "Course announcement selected"
            : selectedCount === 1
              ? "1 student selected"
              : `${selectedCount} students selected`}
        </p>
      </div>
    </div>
  );
}
