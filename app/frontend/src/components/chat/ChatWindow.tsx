import { AlertCircle, Plus } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

import { AssistantMessage } from "@/components/chat/AssistantMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { LoadingIndicator } from "@/components/chat/LoadingIndicator";
import { UserMessage } from "@/components/chat/UserMessage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useActiveCourse } from "@/contexts/useActiveCourse";
import { useInstitution } from "@/contexts/useInstitution";
import { seedChatMessages } from "@/data/assistantSeedData";
import { isCancellationPhrase } from "@/lib/chat-cancellation";
import { mapChatReplyToAssistantResponse } from "@/lib/map-chat-reply";
import {
  AssistantApiError,
  cancelAssistantAction,
  confirmAssistantAction,
  fetchConversation,
  mapConversationToChatMessages,
  sendAssistantMessage,
  type ConversationResponse,
} from "@/services/assistant";
import type { AssistantMessageResult } from "@/services/assistant";
import type { ChatMessage } from "@/types/chat";
import { mapWorkflowStatus } from "@/types/chat";
import type { LlmProviderId, LlmProviderSettings } from "@/types/llmProvider";

function createMessageId(): string {
  return crypto.randomUUID();
}

// A stored assistant message's content is either the full JSON envelope
// the backend returned (for structured replies like intent_preview or a
// tool result — see mapChatReplyToAssistantResponse) or a plain string
// (a plain-text model reply, or an error message logged verbatim). Only
// the former needs remapping on reload; the latter is displayed as-is.
function parseStoredAssistantReply(content: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(content);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function withWelcomeMessage(restoredMessages: ChatMessage[]): ChatMessage[] {
  if (restoredMessages.length === 0) {
    return seedChatMessages;
  }

  return [
    ...seedChatMessages,
    ...restoredMessages.filter((message) => message.id !== "welcome"),
  ];
}

interface InitialChatState {
  messages: ChatMessage[];
  conversationId?: number;
  hydratedConversationId?: number;
}

function getInitialChatState({
  initialConversationId,
  loadedConversation,
}: Pick<
  ChatWindowProps,
  "initialConversationId" | "loadedConversation"
>): InitialChatState {
  if (!loadedConversation) {
    return {
      messages: seedChatMessages,
      conversationId: initialConversationId,
    };
  }

  const loadedMessages = mapConversationToChatMessages(loadedConversation);

  return {
    messages: withWelcomeMessage(loadedMessages),
    conversationId: loadedConversation.id,
    hydratedConversationId: loadedConversation.id,
  };
}

interface ChatWindowProps {
  initialPrompt?: string | null;
  initialDraft?: string | null;
  initialConversationId?: number;
  initialPendingMessageId?: number;
  loadedConversation?: ConversationResponse | null;
  onInitialPromptConsumed?: () => void;
  onModifyContextConsumed?: () => void;
  onConversationChange?: (conversationId: number) => void;
  onLoadingChange?: (isLoading: boolean) => void;
  onStartNewChat?: () => void;
  modelSettings?: LlmProviderSettings | null;
  onModelProviderChange?: (providerId: LlmProviderId) => void;
}

export interface ChatWindowHandle {
  sendPrompt: (prompt: string) => void;
}

export const ChatWindow = forwardRef<ChatWindowHandle, ChatWindowProps>(function ChatWindow({
  initialPrompt = null,
  initialDraft = null,
  initialConversationId,
  initialPendingMessageId,
  loadedConversation = null,
  onInitialPromptConsumed,
  onModifyContextConsumed,
  onConversationChange,
  onLoadingChange,
  onStartNewChat,
  modelSettings = null,
  onModelProviderChange,
}, ref) {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { activeCourse, refreshActiveCourse, notifyCoursesChanged } =
    useActiveCourse();
  const { refreshDashboard } = useInstitution();
  const initialChatState = useMemo(
    () =>
      getInitialChatState({
        initialConversationId,
        loadedConversation,
      }),
    [initialConversationId, loadedConversation],
  );
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => initialChatState.messages,
  );
  const [conversationId, setConversationId] = useState<number | undefined>(
    () => initialChatState.conversationId,
  );
  // A grouped send_message turn can resolve to more than one distinct
  // message, each independently confirmable/cancelable — so more than one
  // preview can be simultaneously pending, not just the single most recent
  // one. See additionalPreviews on AssistantResponse.
  const [activePendingMessageIds, setActivePendingMessageIds] = useState<
    number[]
  >(() => {
    // A loadedConversation can already carry more than one still-pending
    // preview (e.g. a grouped send_message batch) — derive the full set
    // from its messages rather than only trusting the single
    // initialPendingMessageId prop, which only ever names one specific
    // preview (e.g. the one a "review preview" deep link pointed at).
    const pendingFromMessages = initialChatState.messages
      .filter((entry) => entry.pendingActionStatus === "pending")
      .map((entry) => entry.pendingMessageId)
      .filter((id): id is number => id !== undefined);

    if (pendingFromMessages.length > 0) {
      return pendingFromMessages;
    }

    return initialPendingMessageId !== undefined ? [initialPendingMessageId] : [];
  });
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
  const messageListRef = useRef<HTMLDivElement>(null);
  const initialPromptHandledRef = useRef<string | null>(null);
  const hydratedConversationRef = useRef<number | undefined>(
    initialChatState.hydratedConversationId,
  );
  const isDeliveringRef = useRef(false);

  const assistantContext = useMemo(
    () => ({
      activeCourseLabel: activeCourse?.displayName,
      activeCourseId: activeCourse?.localId,
    }),
    [activeCourse?.displayName, activeCourse?.localId],
  );

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList) {
      return;
    }

    messageList.scrollTop = messageList.scrollHeight;
  }, [messages, isLoading, error]);

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  useEffect(() => {
    if (
      !accessToken ||
      loadedConversation ||
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

        // Authoritative per-preview status, keyed by preview_message_id —
        // see WorkflowStatus in app/backend/app/schemas/chat.py. Replaces
        // the old FIFO reconstruction (matching "[confirmed action]"/
        // "[cancelled action]" marker text to the oldest still-open
        // preview in transcript order), which mislabeled cards whenever
        // more than one preview existed and they were resolved out of
        // order. Live, in-session confirm/cancel (resolvePendingAction)
        // was always unaffected by that bug — it matches by exact message
        // id — this only fixes the post-reload reconstruction.
        const workflowStatuses = conversation.workflow_statuses ?? {};

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
              ? mapWorkflowStatus(workflowStatuses[mapped.pendingMessageId]?.status)
              : undefined,
            explanation: mapped.explanation,
            acknowledgedFields: mapped.acknowledgedFields,
            interpretedAction: mapped.interpretedAction,
            safetyBlocked: mapped.safetyBlocked,
            safetyMessage: mapped.safetyMessage,
          }];
        });

        const nextActivePendingMessageIds = restoredMessages
          .filter((entry) => entry.pendingActionStatus === "pending")
          .map((entry) => entry.pendingMessageId)
          .filter((id): id is number => id !== undefined);

        setMessages(withWelcomeMessage(restoredMessages));
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
  }, [accessToken, initialConversationId, initialPendingMessageId, loadedConversation]);

  const appendAssistantMessage = useCallback(
    (response: AssistantMessageResult) => {
      // Navigate to dedicated form pages instead of showing preview cards.
      // Keep interpretedAction on the transcript so reopening chat history
      // still offers "Open quiz creation form".
      if (response.navigateTo) {
        const briefMsg: ChatMessage = {
          id: createMessageId(),
          role: "assistant",
          content: response.content,
          timestamp: new Date(),
          conversationId: response.conversationId,
          explanation: response.explanation,
          interpretedAction: response.interpretedAction,
        };
        setMessages((current) => [...current, briefMsg]);
        navigate(response.navigateTo.path, { state: response.navigateTo.state });
        return;
      }

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
        acknowledgedFields: entry.acknowledgedFields,
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
    [navigate],
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
          modelSettings: modelSettings ?? undefined,
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
        onConversationChange?.(response.conversationId);
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
      modelSettings,
      onConversationChange,
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
                  // Hide the offer cards after cancel so the proposal
                  // disappears entirely (no leftover explanation/action UI).
                  ...(action === "cancel"
                    ? {
                        handoffDismissed: true,
                        explanation: undefined,
                        interpretedAction: undefined,
                      }
                    : {}),
                }
              : entry,
          ),
        );
        appendAssistantMessage(response);

        if (action === "confirm") {
          // The confirmed action just committed a write to Canvas/the local
          // DB — ActiveCourseProvider and InstitutionProvider are both
          // mounted once for the whole session, so nothing else will ask
          // them to re-fetch. Without this, course/assignment counts and
          // dashboard metrics stay stale until a full page reload.
          void refreshActiveCourse();
          notifyCoursesChanged();
          void refreshDashboard();
        }
      } catch (requestError) {
        // Cancelling a form-handoff leftover (no Workflow row) should still
        // dismiss the UI locally — there is nothing to audit/cancel server-side.
        if (action === "cancel") {
          setActivePendingMessageIds((current) =>
            current.filter((id) => id !== message.pendingMessageId),
          );
          setMessages((current) =>
            current.map((entry) =>
              entry.id === message.id
                ? {
                    ...entry,
                    pendingActionStatus: "cancelled",
                    handoffDismissed: true,
                    explanation: undefined,
                    interpretedAction: undefined,
                    pendingMessageId: undefined,
                  }
                : entry,
            ),
          );
          setPendingActionError(null);
          return;
        }

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
      refreshDashboard,
    ],
  );

  const dismissHandoffOffer = useCallback((messageId: string) => {
    setMessages((current) =>
      current.map((entry) =>
        entry.id === messageId
          ? {
              ...entry,
              handoffDismissed: true,
              explanation: undefined,
              interpretedAction: undefined,
            }
          : entry,
      ),
    );
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

      // Only auto-cancel via a typed phrase ("never mind", etc.) when
      // exactly one preview is pending — with more than one open at once
      // (a grouped send_message batch), which one the phrase refers to is
      // ambiguous, so it falls through to a normal turn instead. Mirrors
      // deliverAssistantResponse's identical single-pending gate above.
      const soleActivePendingMessageId =
        activePendingMessageIds.length === 1
          ? activePendingMessageIds[0]
          : undefined;

      if (
        soleActivePendingMessageId !== undefined &&
        isCancellationPhrase(trimmed)
      ) {
        const pendingMessage = messages.find(
          (entry) =>
            entry.pendingMessageId === soleActivePendingMessageId &&
            entry.pendingActionStatus === "pending",
        );

        if (pendingMessage) {
          void resolvePendingAction(pendingMessage, "cancel");
          return;
        }
      }

      void deliverAssistantResponse(trimmed);
    },
    [
      activePendingMessageIds,
      deliverAssistantResponse,
      messages,
      resolvePendingAction,
    ],
  );

  useImperativeHandle(
    ref,
    () => ({
      sendPrompt: handleSend,
    }),
    [handleSend],
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
    <Card className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden shadow-sm ring-1 ring-border/60">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
        {onStartNewChat ? (
          <div className="flex shrink-0 justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onStartNewChat}
              disabled={isLoading}
            >
              <Plus className="size-4" aria-hidden="true" />
              New Chat
            </Button>
          </div>
        ) : null}

        <div
          ref={messageListRef}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1"
        >
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
                onDismissHandoff={
                  message.interpretedAction && !message.pendingMessageId
                    ? () => dismissHandoffOffer(message.id)
                    : undefined
                }
              />
            ) : (
              <UserMessage key={message.id} message={message} />
            ),
          )}

          {isLoading ? <LoadingIndicator /> : null}
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
          modelSettings={modelSettings}
          onModelProviderChange={onModelProviderChange}
        />
      </CardContent>
    </Card>
  );
});
