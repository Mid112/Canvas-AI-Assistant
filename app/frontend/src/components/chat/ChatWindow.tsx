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
import {
  AssistantApiError,
  cancelAssistantAction,
  confirmAssistantAction,
  fetchConversation,
  mapConversationToChatMessages,
  sendAssistantMessage,
  type ConversationResponse,
} from "@/services/assistant";
import type { ChatMessage } from "@/types/chat";

function createMessageId(): string {
  return crypto.randomUUID();
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

function findLatestPendingMessageId(messages: ChatMessage[]): number | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.pendingActionStatus === "pending") {
      return message.pendingMessageId;
    }
  }

  return undefined;
}

interface InitialChatState {
  messages: ChatMessage[];
  conversationId?: number;
  activePendingMessageId?: number;
  hydratedConversationId?: number;
}

function getInitialChatState({
  initialConversationId,
  initialPendingMessageId,
  loadedConversation,
}: Pick<
  ChatWindowProps,
  "initialConversationId" | "initialPendingMessageId" | "loadedConversation"
>): InitialChatState {
  if (!loadedConversation) {
    return {
      messages: seedChatMessages,
      conversationId: initialConversationId,
      activePendingMessageId: initialPendingMessageId,
    };
  }

  const loadedMessages = mapConversationToChatMessages(loadedConversation);

  return {
    messages: withWelcomeMessage(loadedMessages),
    conversationId: loadedConversation.id,
    activePendingMessageId: findLatestPendingMessageId(loadedMessages),
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
}, ref) {
  const { accessToken } = useAuth();
  const { activeCourse, refreshActiveCourse } = useActiveCourse();
  const { refreshDashboard } = useInstitution();
  const initialChatState = useMemo(
    () =>
      getInitialChatState({
        initialConversationId,
        initialPendingMessageId,
        loadedConversation,
      }),
    [initialConversationId, initialPendingMessageId, loadedConversation],
  );
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => initialChatState.messages,
  );
  const [conversationId, setConversationId] = useState<number | undefined>(
    () => initialChatState.conversationId,
  );
  const [activePendingMessageId, setActivePendingMessageId] = useState<
    number | undefined
  >(() => initialChatState.activePendingMessageId);
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
    scrollAnchorRef.current?.scrollIntoView?.({ behavior: "smooth" });
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

        const restoredMessages = mapConversationToChatMessages(conversation);
        setMessages(withWelcomeMessage(restoredMessages));
        setConversationId(conversation.id);
        setActivePendingMessageId(findLatestPendingMessageId(restoredMessages));
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
  }, [accessToken, initialConversationId, initialPendingMessageId, loadedConversation]);

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
      activePendingMessageId,
      appendAssistantMessage,
      assistantContext,
      conversationId,
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
        onConversationChange?.(response.conversationId);
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
          // The confirmed action just committed a write to Canvas/the local
          // DB — ActiveCourseProvider and InstitutionProvider are both
          // mounted once for the whole session, so nothing else will ask
          // them to re-fetch. Without this, course/assignment counts and
          // dashboard metrics stay stale until a full page reload.
          void refreshActiveCourse();
          void refreshDashboard();
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
      onConversationChange,
      refreshActiveCourse,
      refreshDashboard,
    ],
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
    <Card className="flex min-h-[32rem] flex-1 flex-col overflow-hidden shadow-sm ring-1 ring-border/60">
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
});
