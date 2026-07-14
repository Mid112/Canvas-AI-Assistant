import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface MessageReplyComposerProps {
  onSend: (body: string) => Promise<void>;
  disabled?: boolean;
}

export function MessageReplyComposer({
  onSend,
  disabled = false,
}: MessageReplyComposerProps) {
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || isSending || disabled) {
      return;
    }

    setIsSending(true);
    setError(null);
    try {
      await onSend(trimmed);
      setBody("");
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Unable to send reply.",
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-2">
      <label htmlFor="message-reply-body" className="text-sm font-medium">
        Reply to students
      </label>
      <Textarea
        id="message-reply-body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Write a reply..."
        rows={3}
        disabled={disabled || isSending}
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
          disabled={disabled || isSending || !body.trim()}
        >
          {isSending ? "Sending..." : "Send reply"}
        </Button>
      </div>
    </form>
  );
}
