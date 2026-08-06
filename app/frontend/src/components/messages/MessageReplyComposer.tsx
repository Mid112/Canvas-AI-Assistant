// Messages UI note: supports the instructor message-drafting flow for message reply composer without bypassing preview/confirmation.

import { Loader2, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";

import { MessageReplyPreviewDialog } from "@/components/messages/MessageReplyPreviewDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface MessageReplyPreviewSummary {
  summary: string;
  recipientCount: number;
  bodyPreview: string;
}

interface MessageReplyComposerProps {
  onSend: (body: string) => Promise<void>;
  onGenerateDraft?: () => Promise<string>;
  onPreview?: (body: string) => Promise<MessageReplyPreviewSummary>;
  disabled?: boolean;
}

export function MessageReplyComposer({
  onSend,
  onGenerateDraft,
  onPreview,
  disabled = false,
}: MessageReplyComposerProps) {
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSummary, setPreviewSummary] =
    useState<MessageReplyPreviewSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateDraft = async () => {
    if (!onGenerateDraft || isGenerating || disabled) {
      return;
    }

    setIsGenerating(true);
    setError(null);
    try {
      const draft = await onGenerateDraft();
      setBody(draft);
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Unable to generate a reply draft.",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const sendReply = async (trimmed: string) => {
    setIsSending(true);
    setError(null);
    try {
      await onSend(trimmed);
      setBody("");
      setPreviewOpen(false);
      setPreviewSummary(null);
    } catch (sendError) {
      setError(
        sendError instanceof Error ? sendError.message : "Unable to send reply.",
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || isSending || disabled) {
      return;
    }

    if (onPreview) {
      setError(null);
      try {
        const summary = await onPreview(trimmed);
        setPreviewSummary(summary);
        setPreviewOpen(true);
      } catch (previewError) {
        setError(
          previewError instanceof Error
            ? previewError.message
            : "Unable to preview this reply.",
        );
      }
      return;
    }

    await sendReply(trimmed);
  };

  return (
    <>
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="message-reply-body" className="text-sm font-medium">
            Reply to students
          </label>
          {onGenerateDraft ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleGenerateDraft()}
              disabled={disabled || isGenerating || isSending}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="size-4" aria-hidden="true" />
                  Generate draft
                </>
              )}
            </Button>
          ) : null}
        </div>
        <Textarea
          id="message-reply-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write a reply..."
          rows={3}
          disabled={disabled || isSending || isGenerating}
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={disabled || isSending || isGenerating || !body.trim()}
          >
            {isSending ? "Sending..." : onPreview ? "Review & send" : "Send reply"}
          </Button>
        </div>
      </form>

      <MessageReplyPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        summary={previewSummary?.summary ?? null}
        bodyPreview={previewSummary?.bodyPreview ?? body.trim()}
        recipientCount={previewSummary?.recipientCount ?? 0}
        isSending={isSending}
        onConfirm={() => void sendReply(body.trim())}
      />
    </>
  );
}
