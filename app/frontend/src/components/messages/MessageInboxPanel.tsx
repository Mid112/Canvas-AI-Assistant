import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { MessageInboxList } from "@/components/messages/MessageInboxList";
import { MessageThreadView } from "@/components/messages/MessageThreadView";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useCanvasConnectionUrl } from "@/hooks/useCanvasConnectionUrl";
import { cn } from "@/lib/utils";
import {
  fetchMessageThread,
  fetchMessageThreads,
  replyToMessageThread,
} from "@/services/messageThreads";
import type { MessageThread } from "@/types/messageThread";

interface MessageInboxPanelProps {
  courseId?: number;
}

type InboxScope = "course" | "all";

// How often to quietly re-poll Canvas so incoming student replies (and new
// threads) appear without a manual page refresh. Canvas has no push channel,
// so short-interval polling is the pragmatic option.
const POLL_INTERVAL_MS = 15_000;

export function MessageInboxPanel({ courseId }: MessageInboxPanelProps) {
  const { accessToken } = useAuth();
  const canvasUrl = useCanvasConnectionUrl();
  const [scope, setScope] = useState<InboxScope>(
    courseId != null ? "course" : "all",
  );
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<MessageThread | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isThreadLoading, setIsThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  const effectiveCourseId = scope === "course" ? courseId : undefined;

  const loadThreads = useCallback(async () => {
    if (!accessToken) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchMessageThreads(
        accessToken,
        effectiveCourseId,
        canvasUrl,
      );
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
  }, [accessToken, canvasUrl, effectiveCourseId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kick off async list load
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!accessToken || !selectedThreadId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear detail when nothing is selected
      setSelectedThread(null);
      return;
    }

    let cancelled = false;
    setIsThreadLoading(true);
    setThreadError(null);

    fetchMessageThread(accessToken, selectedThreadId, effectiveCourseId, canvasUrl)
      .then((detail) => {
        if (!cancelled) {
          setSelectedThread(detail);
        }
      })
      .catch((detailError: unknown) => {
        if (!cancelled) {
          setSelectedThread(null);
          setThreadError(
            detailError instanceof Error
              ? detailError.message
              : "Unable to load this conversation.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsThreadLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, canvasUrl, effectiveCourseId, selectedThreadId]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      // Refresh the list quietly so new/updated conversations surface without
      // toggling the loading state (which would flicker the whole panel).
      void fetchMessageThreads(accessToken, effectiveCourseId, canvasUrl)
        .then((result) => {
          setThreads(result.threads);
        })
        .catch(() => {
          // Ignore transient polling failures; the next tick retries.
        });

      // Refresh the open conversation quietly so incoming replies appear.
      if (selectedThreadId) {
        void fetchMessageThread(
          accessToken,
          selectedThreadId,
          effectiveCourseId,
          canvasUrl,
        )
          .then((detail) => {
            setSelectedThread((current) =>
              current && current.id === detail.id ? detail : current,
            );
          })
          .catch(() => {
            // Ignore transient polling failures; the next tick retries.
          });
      }
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [accessToken, canvasUrl, effectiveCourseId, selectedThreadId]);

  const handleReply = async (body: string) => {
    if (!accessToken || !selectedThreadId) {
      return;
    }
    const updated = await replyToMessageThread(
      accessToken,
      selectedThreadId,
      body,
      effectiveCourseId,
      canvasUrl,
    );
    setSelectedThread(updated);
    setThreads((current) =>
      current
        .map((thread) =>
          thread.id === updated.id
            ? {
                ...thread,
                preview: updated.preview,
                updatedAt: updated.updatedAt,
                unreadCount: 0,
              }
            : thread,
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  };

  const scopeToggle =
    courseId != null ? (
      <div
        role="group"
        aria-label="Inbox scope"
        className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5 text-sm"
      >
        <button
          type="button"
          onClick={() => setScope("course")}
          aria-pressed={scope === "course"}
          className={cn(
            "rounded-md px-3 py-1 font-medium transition-colors",
            scope === "course"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          This course
        </button>
        <button
          type="button"
          onClick={() => setScope("all")}
          aria-pressed={scope === "all"}
          className={cn(
            "rounded-md px-3 py-1 font-medium transition-colors",
            scope === "all"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          All courses
        </button>
      </div>
    ) : null;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {scopeToggle}
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2
              className="size-4 animate-spin text-primary"
              aria-hidden="true"
            />
            Loading messages...
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        {scopeToggle}
        <Card className="shadow-sm ring-1 ring-border/60">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p role="alert">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {scopeToggle}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <MessageInboxList
          threads={threads}
          selectedThreadId={selectedThreadId}
          onSelectThread={setSelectedThreadId}
        />
        {threadError ? (
          <div className="flex items-start gap-3 rounded-xl border border-dashed p-8 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p role="alert">{threadError}</p>
          </div>
        ) : isThreadLoading ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed p-8 text-sm text-muted-foreground">
            <Loader2
              className="size-4 animate-spin text-primary"
              aria-hidden="true"
            />
            Loading conversation...
          </div>
        ) : selectedThread ? (
          <MessageThreadView thread={selectedThread} onReply={handleReply} />
        ) : (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Select a message to view the conversation.
          </div>
        )}
      </div>
    </div>
  );
}
