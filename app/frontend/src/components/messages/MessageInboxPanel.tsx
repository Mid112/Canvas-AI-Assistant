import { useCallback, useEffect, useState } from "react";
import { AlertCircle, FlaskConical, Loader2 } from "lucide-react";

import { MessageInboxList } from "@/components/messages/MessageInboxList";
import { MessageThreadView } from "@/components/messages/MessageThreadView";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchMessageThreads,
  replyToMessageThread,
} from "@/services/messageThreads";
import type { MessageThread } from "@/types/messageThread";

interface MessageInboxPanelProps {
  courseId?: number;
}

export function MessageInboxPanel({ courseId }: MessageInboxPanelProps) {
  const { accessToken } = useAuth();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedThread =
    threads.find((thread) => thread.id === selectedThreadId) ?? null;

  const loadThreads = useCallback(async () => {
    if (!accessToken) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchMessageThreads(accessToken, courseId);
      setThreads(result.threads);
      setSelectedThreadId((current) => {
        if (current && result.threads.some((thread) => thread.id === current)) {
          return current;
        }
        return result.threads[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load messages.",
      );
      setThreads([]);
      setSelectedThreadId(null);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, courseId]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const handleReply = async (body: string) => {
    if (!accessToken || !selectedThreadId) {
      return;
    }
    const updated = await replyToMessageThread(
      accessToken,
      selectedThreadId,
      body,
    );
    setThreads((current) =>
      current
        .map((thread) => (thread.id === updated.id ? updated : thread))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  };

  if (isLoading) {
    return (
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
          Loading messages...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardContent className="flex items-start gap-3 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p role="alert">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div
        role="note"
        className="flex items-start gap-3 rounded-lg border border-dashed border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>
          Demo data only. The inbox and replies below are sample threads stored
          locally in your browser — they are not connected to Canvas, and
          replies are not delivered to students.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <MessageInboxList
          threads={threads}
          selectedThreadId={selectedThreadId}
          onSelectThread={setSelectedThreadId}
        />
        {selectedThread ? (
          <MessageThreadView thread={selectedThread} onReply={handleReply} />
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Select a message to view the conversation and student replies.
          </div>
        )}
      </div>
    </div>
  );
}
