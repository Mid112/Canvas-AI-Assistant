import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { formatDueDateForDisplay } from "@/lib/assignment-utils";
import {
  fetchSentMessageDrafts,
  MessageDraftApiError,
} from "@/services/messageDraft";
import type { SentMessageDraft } from "@/types/messageDraft";

interface MessageSentPanelProps {
  courseId?: number;
  courseLabel?: string;
  courseNameById?: Record<number, string>;
}

export function MessageSentPanel({
  courseId,
  courseLabel,
  courseNameById = {},
}: MessageSentPanelProps) {
  const { accessToken } = useAuth();
  const [items, setItems] = useState<SentMessageDraft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSent = useCallback(async () => {
    if (!accessToken) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const drafts = await fetchSentMessageDrafts(accessToken, {
        courseId,
      });
      setItems(drafts);
    } catch (loadError) {
      setError(
        loadError instanceof MessageDraftApiError
          ? loadError.message
          : loadError instanceof Error
            ? loadError.message
            : "Unable to load sent messages.",
      );
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, courseId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kick off async list load
    void loadSent();
  }, [loadSent]);

  if (isLoading) {
    return (
      <Card className="shadow-sm ring-1 ring-border/60">
        <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Loader2
            className="size-4 animate-spin text-primary"
            aria-hidden="true"
          />
          Loading sent messages...
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

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        {courseLabel
          ? `No sent messages for ${courseLabel} yet.`
          : "No sent messages yet. Compose a message to see it here."}
      </div>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Sent messages">
      {items.map((item) => {
        const courseName =
          (item.courseId != null ? courseNameById[item.courseId] : undefined) ??
          courseLabel ??
          (item.courseId != null ? `Course ${item.courseId}` : "All courses");
        const modeLabel =
          item.deliveryMode === "announcement" ? "Announcement" : "Direct";
        const recipientLabel =
          item.deliveryMode === "announcement"
            ? "Entire course"
            : item.recipients.length === 1
              ? item.recipients[0]?.name
              : `${item.recipients.length} recipients`;

        return (
          <li key={item.id}>
            <Card className="shadow-sm ring-1 ring-border/60">
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate font-medium text-foreground">
                      {item.subject}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {courseName}
                      {" · "}
                      {recipientLabel}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
                    <span className="rounded-md bg-muted px-2 py-0.5 font-medium text-foreground">
                      {modeLabel}
                    </span>
                    <time dateTime={item.sentAt ?? item.updatedAt}>
                      {formatDueDateForDisplay(item.sentAt ?? item.updatedAt)}
                    </time>
                  </div>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {item.body}
                </p>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
