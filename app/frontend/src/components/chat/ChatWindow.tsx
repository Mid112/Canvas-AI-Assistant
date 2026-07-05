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
import {
  AssistantApiError,
  cancelAssistantAction,
  confirmAssistantAction,
  sendAssistantMessage,
} from "@/services/assistant";
import type { ChatMessage } from "@/types/chat";

function createMessageId(): string {
  return crypto.randomUUID();
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
  const [draftValue, setDraftValue] = useState(initialDraft ?? "");
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const initialPromptHandledRef = useRef<string | null>(null);
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

  const appendAssistantMessage = useCallback((response: {
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
  }, []);

  const deliverAssistantResponse = useCallback(async (userText: string) => {
    if (isDeliveringRef.current) {
      return;
    }

    isDeliveringRef.current = true;
    setIsLoading(true);
    setError(null);
    setRetryMessage(userText);

    if (!accessToken) {
      setError("You must be signed in to use the assistant.");
      isDeliveringRef.current = false;
      setIsLoading(false);
      return;
    }

    const pendingMessageIdToSend = activePendingMessageId;

    try {
      const response = await sendAssistantMessage(userText, {
        accessToken,
        context: assistantContext,
        conversationId,
        pendingMessageId: pendingMessageIdToSend,
      });

      if (pendingMessageIdToSend !== undefined) {
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
  }, [
    accessToken,
    activePendingMessageId,
    appendAssistantMessage,
    assistantContext,
    conversationId,
    onModifyContextConsumed,
  ]);

  const resolvePendingAction = useCallback(
    async (
      message: ChatMessage,
      action: "confirm" | "cancel",
    ) => {
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
                assistantContext,
              )
            : await cancelAssistantAction(
                accessToken,
                activeConversationId,
                message.pendingMessageId,
                assistantContext,
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
      assistantContext,
      conversationId,
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
      setDraftValue("");

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
    if (!initialDraft) {
      return;
    }

    setDraftValue(initialDraft);
  }, [initialDraft]);

  useEffect(() => {
    if (!initialPrompt || initialPromptHandledRef.current === initialPrompt) {
      return;
    }

    initialPromptHandledRef.current = initialPrompt;
    handleSend(initialPrompt);
    onInitialPromptConsumed?.();
    initialPromptHandledRef.current = null;
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
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
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
          onSend={handleSend}
          isLoading={isLoading}
          inputError={inputError}
          initialValue={draftValue}
        />
      </CardContent>
    </Card>
  );
}
