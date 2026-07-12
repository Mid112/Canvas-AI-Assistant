import { AlertCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AssistantMessage } from "@/components/chat/AssistantMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { LoadingIndicator } from "@/components/chat/LoadingIndicator";
import { UserMessage } from "@/components/chat/UserMessage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import { seedChatMessages } from "@/data/assistantSeedData";
import { mapChatReplyToAssistantResponse } from "@/lib/map-chat-reply";
import {
  AssistantApiError,
  cancelAssistantAction,
  confirmAssistantAction,
  fetchConversation,
  sendAssistantMessage,
} from "@/services/assistant";
import type { AssistantMessageResult } from "@/services/assistant";
import type { ChatMessage } from "@/types/chat";

function createMessageId(): string {
  return crypto.randomUUID();
}

function parseStoredAssistantReply(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

interface ChatWindowProps {
  initialPrompt?: string | null;
  initialDraft?: string | null;
  initialConversationId?: number;
  initialPendingMessageId?: number;
  onInitialPromptConsumed?: () => void;
  onModifyContextConsumed?: () => void;
  onLoadingChange?: (isLoading: boolean) => void;
}

export function ChatWindow({
  initialPrompt = null,
  initialDraft = null,
  initialConversationId,
  initialPendingMessageId,
  onInitialPromptConsumed,
  onModifyContextConsumed,
  onLoadingChange,
}: ChatWindowProps) {
  const { accessToken } = useAuth();
  const { activeCourse } = useActiveCourse();
  const [messages, setMessages] = useState<ChatMessage[]>(seedChatMessages);
  const [conversationId, setConversationId] = useState<number | undefined>(
    initialConversationId,
  );
  // A grouped send_message turn can resolve to more than one distinct
  // message, each independently confirmable/cancelable — so more than one
  // preview can be simultaneously pending, not just the single most recent
  // one. See additionalPreviews on AssistantResponse.
  const [activePendingMessageIds, setActivePendingMessageIds] = useState<
    number[]
  >(initialPendingMessageId !== undefined ? [initialPendingMessageId] : []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [resolvingMessageId, setResolvingMessageId] = useState<string | null>(
    null,
  );
  const [pendingActionError, setPendingActionError] = useState<string | null>(
    null,
  );
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const initialPromptHandledRef = useRef<string | null>(null);
  const hydratedConversationRef = useRef<number | undefined>(undefined);
  const isDeliveringRef = useRef(false);

  const assistantContext = useMemo(
    () => ({
      activeCourseLabel: activeCourse?.displayName,
      activeCourseId: activeCourse?.localId,
    }),
    [activeCourse?.displayName, activeCourse?.localId],
  );

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, isLoading, error]);

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  useEffect(() => {
    if (
      !accessToken ||
      initialConversationId === undefined ||
      hydratedConversationRef.current === initialConversationId
    ) {
      return;
    }

    let cancelled = false;

    async function hydrateConversation() {
      try {
        const conversation = await fetchConversation(
          accessToken!,
          initialConversationId!,
        );
        if (cancelled) {
          return;
        }

        const pendingStatuses = new Map<number, ChatMessage["pendingActionStatus"]>();
        // More than one preview can be simultaneously open (a grouped
        // send_message batch), so this tracks every still-open preview
        // message id in creation order, not just the single latest one.
        // "[confirmed action]"/"[cancelled action]" marker messages don't
        // record which specific preview they settled, so replaying history
        // resolves the oldest still-open one first (FIFO) — an
        // approximation that matches the common case (previews from one
        // batch resolved in the order they were shown) but can mislabel
        // status if a user resolved them out of order in a since-reloaded
        // session. Live, in-session confirm/cancel (resolvePendingAction)
        // is unaffected — it always matches by exact message id.
        const openPendingMessageIds: number[] = [];

        for (const storedMessage of conversation.messages) {
          const parsed =
            storedMessage.role === "assistant"
              ? parseStoredAssistantReply(storedMessage.content)
              : null;

          if (parsed?.intent_preview) {
            pendingStatuses.set(storedMessage.id, "pending");
            openPendingMessageIds.push(storedMessage.id);
          }

          if (storedMessage.role === "user" && openPendingMessageIds.length > 0) {
            if (storedMessage.content === "[cancelled action]") {
              pendingStatuses.set(openPendingMessageIds.shift()!, "cancelled");
            } else if (storedMessage.content === "[confirmed action]") {
              pendingStatuses.set(openPendingMessageIds.shift()!, "confirmed");
            }
          }
        }

        const restoredMessages = conversation.messages.flatMap<ChatMessage>((storedMessage) => {
          const timestamp = new Date(storedMessage.created_at);

          if (storedMessage.role === "user") {
            if (storedMessage.content.startsWith("[")) {
              return [];
            }

            return [{
              id: String(storedMessage.id),
              role: "user",
              content: storedMessage.content,
              timestamp,
              conversationId: conversation.id,
            }];
          }

          const parsed = parseStoredAssistantReply(storedMessage.content);
          if (!parsed) {
            return [{
              id: String(storedMessage.id),
              role: "assistant",
              content: storedMessage.content,
              timestamp,
              conversationId: conversation.id,
            }];
          }

          const reply = parsed.intent_preview && parsed.pending_message_id === undefined
            ? { ...parsed, pending_message_id: storedMessage.id }
            : parsed;
          const mapped = mapChatReplyToAssistantResponse(reply, false, conversation.id);

          return [{
            id: String(storedMessage.id),
            role: "assistant",
            content: mapped.content,
            timestamp,
            conversationId: conversation.id,
            pendingMessageId: mapped.pendingMessageId,
            pendingActionStatus: mapped.pendingMessageId
              ? pendingStatuses.get(mapped.pendingMessageId) ?? "pending"
              : undefined,
            explanation: mapped.explanation,
            interpretedAction: mapped.interpretedAction,
            safetyBlocked: mapped.safetyBlocked,
            safetyMessage: mapped.safetyMessage,
          }];
        });

        const nextActivePendingMessageIds: number[] = [];
        for (const [messageId, status] of pendingStatuses) {
          if (status === "pending") {
            nextActivePendingMessageIds.push(messageId);
          }
        }

        setMessages(restoredMessages.length > 0 ? restoredMessages : seedChatMessages);
        setConversationId(conversation.id);
        setActivePendingMessageIds(nextActivePendingMessageIds);
        hydratedConversationRef.current = initialConversationId;
      } catch {
        if (cancelled) {
          return;
        }

        // Keep the seeded assistant greeting if restoring history fails; the
        // next send still continues in the existing conversation id.
        setConversationId(initialConversationId);
        setActivePendingMessageIds(
          initialPendingMessageId !== undefined ? [initialPendingMessageId] : [],
        );
      }
    }

    void hydrateConversation();

    return () => {
      cancelled = true;
    };
  }, [accessToken, initialConversationId, initialPendingMessageId]);

  const appendAssistantMessage = useCallback(
    (response: AssistantMessageResult) => {
      // A grouped send_message turn can resolve to more than one distinct
      // message — the primary response plus every entry in
      // additionalPreviews all become their own message row, each
      // independently confirmable/cancelable.
      const allResponses = [response, ...(response.additionalPreviews ?? [])];

      const newMessages: ChatMessage[] = allResponses.map((entry) => ({
        id: createMessageId(),
        role: "assistant",
        content: entry.content,
        timestamp: new Date(),
        conversationId: entry.conversationId ?? response.conversationId,
        pendingMessageId: entry.pendingMessageId,
        pendingActionStatus: entry.pendingMessageId ? "pending" : undefined,
        explanation: entry.explanation,
        interpretedAction: entry.interpretedAction,
        safetyBlocked: entry.safetyBlocked,
        safetyMessage: entry.safetyMessage,
      }));

      setMessages((current) => [...current, ...newMessages]);

      const newPendingIds = newMessages
        .map((entry) => entry.pendingMessageId)
        .filter((id): id is number => id !== undefined);
      if (newPendingIds.length > 0) {
        setActivePendingMessageIds((current) => [...current, ...newPendingIds]);
      }
    },
    [],
  );

  const deliverAssistantResponse = useCallback(
    async (userText: string) => {
      if (isDeliveringRef.current) {
        return;
      }

      if (!accessToken) {
        setError("You must be signed in to use the assistant.");
        return;
      }

      isDeliveringRef.current = true;
      setIsLoading(true);
      setError(null);
      setRetryMessage(userText);

      // Only target a specific preview for modification when exactly one is
      // currently pending — with more than one open at once (a grouped
      // send_message batch), which one a free-typed follow-up should modify
      // is ambiguous, so it starts a fresh normal turn instead. A future
      // auto-advancing queue (only ever surfacing one preview at a time)
      // removes this limitation.
      const pendingMessageIdToSend =
        activePendingMessageIds.length === 1 ? activePendingMessageIds[0] : undefined;

      try {
        const response = await sendAssistantMessage(accessToken, userText, {
          context: assistantContext,
          conversationId,
          pendingMessageId: pendingMessageIdToSend,
        });

        if (pendingMessageIdToSend !== undefined) {
          setMessages((current) =>
            current.map((entry) =>
              entry.pendingMessageId === pendingMessageIdToSend &&
              entry.pendingActionStatus === "pending"
                ? { ...entry, pendingActionStatus: "superseded" }
                : entry,
            ),
          );
          setActivePendingMessageIds((current) =>
            current.filter((id) => id !== pendingMessageIdToSend),
          );
          onModifyContextConsumed?.();
        }

        setConversationId(response.conversationId);
        appendAssistantMessage(response);
        setRetryMessage(null);
      } catch (requestError) {
        const message =
          requestError instanceof AssistantApiError
            ? requestError.message
            : "Something went wrong. Please try again.";
        setError(message);
      } finally {
        isDeliveringRef.current = false;
        setIsLoading(false);
      }
    },
    [
      accessToken,
      activePendingMessageIds,
      appendAssistantMessage,
      assistantContext,
      conversationId,
      onModifyContextConsumed,
    ],
  );

  const resolvePendingAction = useCallback(
    async (message: ChatMessage, action: "confirm" | "cancel") => {
      if (
        !accessToken ||
        message.pendingMessageId === undefined ||
        message.pendingActionStatus !== "pending"
      ) {
        return;
      }

      const activeConversationId = message.conversationId ?? conversationId;
      if (activeConversationId === undefined) {
        return;
      }

      setResolvingMessageId(message.id);
      setPendingActionError(null);

      try {
        const response =
          action === "confirm"
            ? await confirmAssistantAction(
                accessToken,
                activeConversationId,
                message.pendingMessageId,
              )
            : await cancelAssistantAction(
                accessToken,
                activeConversationId,
                message.pendingMessageId,
              );

        setConversationId(response.conversationId);
        setActivePendingMessageIds((current) =>
          current.filter((id) => id !== message.pendingMessageId),
        );
        setMessages((current) =>
          current.map((entry) =>
            entry.id === message.id
              ? {
                  ...entry,
                  pendingActionStatus:
                    action === "confirm" ? "confirmed" : "cancelled",
                }
              : entry,
          ),
        );
        appendAssistantMessage(response);
      } catch (requestError) {
        const errorMessage =
          requestError instanceof AssistantApiError
            ? requestError.message
            : "Unable to update this proposed action. Please try again.";
        setPendingActionError(errorMessage);
      } finally {
        setResolvingMessageId(null);
      }
    },
    [accessToken, appendAssistantMessage, conversationId],
  );

  const handleSend = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setInputError("Please enter a message before sending.");
        return;
      }

      setInputError(null);

      const userMessage: ChatMessage = {
        id: createMessageId(),
        role: "user",
        content: trimmed,
        timestamp: new Date(),
      };

      setMessages((current) => [...current, userMessage]);
      void deliverAssistantResponse(trimmed);
    },
    [deliverAssistantResponse],
  );

  useEffect(() => {
    if (!initialPrompt || initialPromptHandledRef.current === initialPrompt) {
      return;
    }

    // Deliberately not reset back to null after sending: onInitialPromptConsumed
    // clears the prompt in the parent asynchronously, so this same effect can
    // still re-run with the identical initialPrompt before that update lands
    // (guaranteed to happen under React 18 StrictMode's dev-only mount ->
    // cleanup -> remount cycle). Resetting the guard here made it forget it
    // had already sent this exact prompt, so the remount sent it a second
    // time. The guard only needs to remember "have I handled this string
    // yet" — the next real render, once pendingPrompt is actually cleared,
    // falls through via the `!initialPrompt` check above instead.
    initialPromptHandledRef.current = initialPrompt;
    handleSend(initialPrompt);
    onInitialPromptConsumed?.();
  }, [handleSend, initialPrompt, onInitialPromptConsumed]);

  const handleRetry = () => {
    if (!retryMessage || isDeliveringRef.current) {
      return;
    }

    void deliverAssistantResponse(retryMessage);
  };

  return (
    <Card className="flex min-h-[32rem] flex-1 flex-col overflow-hidden shadow-sm ring-1 ring-border/60">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {messages.map((message) =>
            message.role === "assistant" ? (
              <AssistantMessage
                key={message.id}
                message={message}
                isResolvingPendingAction={resolvingMessageId === message.id}
                pendingActionError={
                  resolvingMessageId === message.id ? pendingActionError : null
                }
                onConfirmPendingAction={
                  message.pendingMessageId
                    ? () => void resolvePendingAction(message, "confirm")
                    : undefined
                }
                onCancelPendingAction={
                  message.pendingMessageId
                    ? () => void resolvePendingAction(message, "cancel")
                    : undefined
                }
              />
            ) : (
              <UserMessage key={message.id} message={message} />
            ),
          )}

          {isLoading ? <LoadingIndicator /> : null}
          <div ref={scrollAnchorRef} />
        </div>

        {error ? (
          <div
            role="alert"
            className="shrink-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
          >
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <span>{error}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRetry}
              disabled={isLoading || !retryMessage}
            >
              Retry
            </Button>
          </div>
        ) : null}

        <ChatInput
          key={initialDraft ?? ""}
          onSend={handleSend}
          isLoading={isLoading}
          inputError={inputError}
          initialValue={initialDraft ?? ""}
        />
      </CardContent>
    </Card>
  );
}
