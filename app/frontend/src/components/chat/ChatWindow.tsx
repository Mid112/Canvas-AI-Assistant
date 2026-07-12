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
import { isCancellationPhrase } from "@/lib/chat-cancellation";
import { mapChatReplyToAssistantResponse } from "@/lib/map-chat-reply";
import {
  AssistantApiError,
  cancelAssistantAction,
  confirmAssistantAction,
  fetchConversation,
  sendAssistantMessage,
} from "@/services/assistant";
import type { ChatMessage } from "@/types/chat";
import type { LlmProviderId, LlmProviderSettings } from "@/types/llmProvider";

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
  modelSettings?: LlmProviderSettings | null;
  onModelProviderChange?: (providerId: LlmProviderId) => void;
}

export function ChatWindow({
  initialPrompt = null,
  initialDraft = null,
  initialConversationId,
  initialPendingMessageId,
  onInitialPromptConsumed,
  onModifyContextConsumed,
  onLoadingChange,
  modelSettings = null,
  onModelProviderChange,
}: ChatWindowProps) {
  const { accessToken } = useAuth();
  const { activeCourse, refreshActiveCourse, notifyCoursesChanged } =
    useActiveCourse();
  const [messages, setMessages] = useState<ChatMessage[]>(seedChatMessages);
  const [conversationId, setConversationId] = useState<number | undefined>(
    initialConversationId,
  );
  const [activePendingMessageId, setActivePendingMessageId] = useState<
    number | undefined
  >(initialPendingMessageId);
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
  const [editDraft, setEditDraft] = useState("");
  const [editDraftKey, setEditDraftKey] = useState(0);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const initialPromptHandledRef = useRef<string | null>(null);
  const hydratedConversationRef = useRef<number | undefined>(undefined);
  const isDeliveringRef = useRef(false);
  const previousCourseIdRef = useRef<number | null | undefined>(undefined);

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

  // Reset the chat thread when the active course changes so the UI does not
  // keep showing another course's history while the backend forks a new
  // conversation on the next send.
  useEffect(() => {
    const nextCourseId = activeCourse?.localId ?? null;
    const previousCourseId = previousCourseIdRef.current;
    previousCourseIdRef.current = nextCourseId;

    // First observation (including null → first course load) should not wipe
    // an in-progress hydrate or modify-return flow.
    if (previousCourseId === undefined) {
      return;
    }
    if (previousCourseId === nextCourseId) {
      return;
    }
    if (previousCourseId === null && nextCourseId !== null) {
      return;
    }

    setMessages(seedChatMessages);
    setConversationId(undefined);
    setActivePendingMessageId(undefined);
    setError(null);
    setInputError(null);
    setRetryMessage(null);
    setPendingActionError(null);
    setEditDraft("");
    setEditDraftKey((key) => key + 1);
    hydratedConversationRef.current = undefined;
    initialPromptHandledRef.current = null;
  }, [activeCourse?.localId]);

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
        let latestPendingMessageId: number | undefined;

        for (const storedMessage of conversation.messages) {
          const parsed =
            storedMessage.role === "assistant"
              ? parseStoredAssistantReply(storedMessage.content)
              : null;

          if (parsed?.intent_preview) {
            pendingStatuses.set(storedMessage.id, "pending");
            latestPendingMessageId = storedMessage.id;
          }

          if (storedMessage.role === "user" && latestPendingMessageId !== undefined) {
            if (storedMessage.content === "[cancelled action]") {
              pendingStatuses.set(latestPendingMessageId, "cancelled");
              latestPendingMessageId = undefined;
            } else if (storedMessage.content === "[confirmed action]") {
              pendingStatuses.set(latestPendingMessageId, "confirmed");
              latestPendingMessageId = undefined;
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

        let nextActivePendingMessageId: number | undefined;
        for (const [messageId, status] of pendingStatuses) {
          if (status === "pending") {
            nextActivePendingMessageId = messageId;
          }
        }

        setMessages(restoredMessages.length > 0 ? restoredMessages : seedChatMessages);
        setConversationId(conversation.id);
        setActivePendingMessageId(nextActivePendingMessageId);
        hydratedConversationRef.current = initialConversationId;
      } catch {
        if (cancelled) {
          return;
        }

        // Keep the seeded assistant greeting if restoring history fails; the
        // next send still continues in the existing conversation id.
        setConversationId(initialConversationId);
        setActivePendingMessageId(initialPendingMessageId);
      }
    }

    void hydrateConversation();

    return () => {
      cancelled = true;
    };
  }, [accessToken, initialConversationId, initialPendingMessageId]);

  const appendAssistantMessage = useCallback(
    (response: {
      content: string;
      conversationId: number;
      explanation?: string;
      interpretedAction?: ChatMessage["interpretedAction"];
      safetyBlocked?: boolean;
      safetyMessage?: string;
      pendingMessageId?: number;
    }) => {
      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: "assistant",
        content: response.content,
        timestamp: new Date(),
        conversationId: response.conversationId,
        pendingMessageId: response.pendingMessageId,
        pendingActionStatus: response.pendingMessageId ? "pending" : undefined,
        explanation: response.explanation,
        interpretedAction: response.interpretedAction,
        safetyBlocked: response.safetyBlocked,
        safetyMessage: response.safetyMessage,
      };

      setMessages((current) => [...current, assistantMessage]);

      if (response.pendingMessageId) {
        setActivePendingMessageId(response.pendingMessageId);
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

      const pendingMessageIdToSend = activePendingMessageId;

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
          setActivePendingMessageId(undefined);
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
      activePendingMessageId,
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
        setActivePendingMessageId(undefined);
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
        if (action === "confirm") {
          void refreshActiveCourse();
          notifyCoursesChanged();
        }
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
    [
      accessToken,
      appendAssistantMessage,
      conversationId,
      notifyCoursesChanged,
      refreshActiveCourse,
    ],
  );

  const handleModifyPendingAction = useCallback(() => {
    setEditDraft("Please change the proposed action: ");
    setEditDraftKey((key) => key + 1);
    setInputError(null);
  }, []);

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

      // If the user types a dismissal like "never mind" while an action is
      // awaiting confirmation, cleanly cancel the pending proposal instead of
      // forwarding the text to the LLM (which can surface a malformed-response
      // error rather than a clean cancellation).
      if (
        activePendingMessageId !== undefined &&
        isCancellationPhrase(trimmed)
      ) {
        const pendingMessage = messages.find(
          (entry) =>
            entry.pendingMessageId === activePendingMessageId &&
            entry.pendingActionStatus === "pending",
        );

        if (pendingMessage) {
          void resolvePendingAction(pendingMessage, "cancel");
          return;
        }
      }

      void deliverAssistantResponse(trimmed);
    },
    [activePendingMessageId, deliverAssistantResponse, messages, resolvePendingAction],
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
                onModifyPendingAction={
                  message.pendingMessageId &&
                  message.pendingActionStatus === "pending"
                    ? handleModifyPendingAction
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
          key={`${initialDraft ?? ""}-${editDraftKey}`}
          onSend={handleSend}
          isLoading={isLoading}
          inputError={inputError}
          initialValue={editDraft || initialDraft || ""}
          modelSettings={modelSettings}
          onModelProviderChange={onModelProviderChange}
        />
      </CardContent>
    </Card>
  );
}
