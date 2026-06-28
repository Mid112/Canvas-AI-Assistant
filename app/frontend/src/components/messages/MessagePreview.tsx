import type { MessageDraftFormSchema } from "./messageDraftSchema";
import type { MessageRecipient } from "@/types/messageDraft";

interface MessagePreviewProps {
  recipients: MessageRecipient[];
  subject: string;
  body: string;
}

export function MessagePreview({ recipients, subject, body }: MessagePreviewProps) {
  const recipientLabel =
    recipients.length === 1
      ? recipients[0]?.name
      : `${recipients.length} students`;

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          To
        </p>
        {recipients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recipients selected</p>
        ) : recipients.length <= 3 ? (
          <ul className="space-y-1">
            {recipients.map((recipient) => (
              <li key={recipient.id} className="text-sm">
                <span className="font-medium">{recipient.name}</span>
                <span className="text-muted-foreground"> &lt;{recipient.email}&gt;</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm font-medium">{recipientLabel}</p>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Subject
        </p>
        <p className="text-sm font-medium">{subject || "—"}</p>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Message
        </p>
        <div className="rounded-lg border bg-muted/20 px-4 py-3">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground">
            {body || "—"}
          </pre>
        </div>
      </div>
    </div>
  );
}

export type { MessageDraftFormSchema };
