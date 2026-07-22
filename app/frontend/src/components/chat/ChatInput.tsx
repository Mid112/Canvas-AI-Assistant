import { Send } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";

import { ChatModelSwitcher } from "@/components/chat/ChatModelSwitcher";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { dashboardColors } from "@/pages/Instructor/InstructorDashboard/dashboardColors";
import type { InstructorLlmProvider } from "@/services/instructorLlmProviders";
import type { LlmProviderId, LlmProviderSettings } from "@/types/llmProvider";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  isDisabled?: boolean;
  inputError?: string | null;
  initialValue?: string;
  modelSettings?: LlmProviderSettings | null;
  llmProviders?: InstructorLlmProvider[];
  onModelProviderChange?: (providerId: LlmProviderId) => void;
}

export function ChatInput({
  onSend,
  isLoading,
  isDisabled = false,
  inputError,
  initialValue = "",
  modelSettings = null,
  llmProviders = [],
  onModelProviderChange,
}: ChatInputProps) {
  const [value, setValue] = useState(initialValue);

  const submitMessage = () => {
    const trimmed = value.trim();
    if (isLoading || isDisabled) {
      return;
    }

    if (!trimmed) {
      onSend("");
      return;
    }

    onSend(trimmed);
    setValue("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitMessage();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitMessage();
    }
  };

  return (
    <div className="space-y-2">
      <form
        onSubmit={handleSubmit}
        className={cn(
          "rounded-2xl border border-border/80 bg-background shadow-sm",
          "focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
        )}
      >
        <label htmlFor="chat-message-input" className="sr-only">
          Chat message
        </label>
        <textarea
          id="chat-message-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything about your Canvas courses..."
          disabled={isLoading || isDisabled}
          aria-label="Chat message"
          aria-invalid={Boolean(inputError)}
          rows={2}
          className={cn(
            "min-h-[52px] w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm outline-none",
            "placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />

        <div className="flex items-center justify-between gap-2 px-2 pb-2">
          <div className="min-w-0">
            {modelSettings && onModelProviderChange ? (
              <ChatModelSwitcher
                settings={modelSettings}
                providers={llmProviders}
                onProviderChange={onModelProviderChange}
                disabled={isDisabled || isLoading}
              />
            ) : (
              <span className="px-2 text-xs text-muted-foreground">Model</span>
            )}
          </div>

          <Button
            type="submit"
            size="icon"
            disabled={isLoading || isDisabled}
            className={cn("size-9 rounded-full", dashboardColors.blue.button)}
            aria-label="Send message"
          >
            <Send className="size-4" />
          </Button>
        </div>
      </form>

      {inputError ? (
        <p role="alert" className="text-sm text-destructive">
          {inputError}
        </p>
      ) : null}

      <p className="text-center text-xs text-muted-foreground">
        AI Assistant can make mistakes. Please verify important information before approving Canvas changes.
      </p>
    </div>
  );
}
