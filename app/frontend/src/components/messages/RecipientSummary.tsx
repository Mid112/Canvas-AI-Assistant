import { cn } from "@/lib/utils";
import { dashboardColors } from "@/pages/Instructor/InstructorDashboard/dashboardColors";
import type { MessageRecipient } from "@/types/messageDraft";

interface RecipientSummaryProps {
  recipients: MessageRecipient[];
}

export function RecipientSummary({ recipients }: RecipientSummaryProps) {
  const recipientCount = recipients.length;
  const selectedLabel =
    recipientCount === 1
      ? "1 student selected"
      : `${recipientCount} students selected`;

  return (
    <div className="rounded-xl border border-border/60 bg-white shadow-sm ring-1 ring-border/60">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <h2 className="text-sm font-semibold">Select Students</h2>
        {recipientCount > 0 ? (
          <span className={cn("text-xs font-medium", dashboardColors.blue.accent)}>
            All selected
          </span>
        ) : null}
      </div>

      <div className="max-h-64 overflow-y-auto">
        {recipientCount === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No recipients selected. Add students before sending this message.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {recipients.map((recipient) => (
              <li key={recipient.id} className="px-4 py-3">
                <p className="text-sm font-medium">{recipient.name}</p>
                <p className="text-xs text-muted-foreground">{recipient.email}</p>
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
