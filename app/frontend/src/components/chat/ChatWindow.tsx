import { AlertCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AssistantMessage } from "@/components/chat/AssistantMessage";
import { ChatInput } from "@/components/chat/ChatInput";
import { LoadingIndicator } from "@/components/chat/LoadingIndicator";
import { UserMessage } from "@/components/chat/UserMessage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { seedChatMessages } from "@/data/mockAssistantChat";
import {
  AssistantApiError,
  sendAssistantMessage,
} from "@/services/assistant";
import type { ChatMessage } from "@/types/chat";

function createMessageId(): string {
  return crypto.randomUUID();
}

interface ChatWindowProps {
  initialPrompt?: string | null;
  onInitialPromptConsumed?: () => void;
  onLoadingChange?: (isLoading: boolean) => void;
}

export function ChatWindow({
  initialPrompt = null,
  onInitialPromptConsumed,
  onLoadingChange,
}: ChatWindowProps) {
  const { accessToken } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>(seedChatMessages);
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const initialPromptHandledRef = useRef<string | null>(null);
  const isDeliveringRef = useRef(false);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages, isLoading, error]);

  useEffect(() => {
    onLoadingChange?.(isLoading);
  }, [isLoading, onLoadingChange]);

  const deliverAssistantResponse = useCallback(async (userText: string) => {
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

    try {
      const response = await sendAssistantMessage(accessToken, userText, {
        conversationId,
      });

      setConversationId(response.conversationId);

      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: "assistant",
        content: response.content,
        timestamp: new Date(),
        explanation: response.explanation,
        interpretedAction: response.interpretedAction,
        safetyBlocked: response.safetyBlocked,
        safetyMessage: response.safetyMessage,
        pendingMessageId: response.pendingMessageId,
      };

      setMessages((current) => [...current, assistantMessage]);
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
  }, [accessToken, conversationId]);

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
              <AssistantMessage key={message.id} message={message} />
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
        />
      </CardContent>
    </Card>
  );
}
