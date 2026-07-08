import { Send } from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { dashboardColors } from "@/pages/Instructor/InstructorDashboard/dashboardColors";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  isDisabled?: boolean;
  inputError?: string | null;
  initialValue?: string;
}

export function ChatInput({
  onSend,
  isLoading,
  isDisabled = false,
  inputError,
  initialValue = "",
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

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitMessage();
    }
  };

  return (
    <div className="space-y-2">
      <form onSubmit={handleSubmit} className="relative">
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything about your Canvas courses..."
          disabled={isLoading || isDisabled}
          aria-label="Chat message"
          aria-invalid={Boolean(inputError)}
          className="h-12 rounded-full pr-14"
        />
        <Button
          type="submit"
          size="icon"
          disabled={isLoading || isDisabled}
          className={cn(
            "absolute top-1/2 right-1.5 size-9 -translate-y-1/2 rounded-full",
            dashboardColors.blue.button,
          )}
          aria-label="Send message"
        >
          <Send className="size-4" />
        </Button>
      </form>

      {inputError ? (
        <p role="alert" className="text-sm text-destructive">
          {inputError}
        </p>
      ) : null}

      <p className="text-center text-xs text-muted-foreground">
        AI Assistant can make mistakes. Please verify important information.
      </p>
    </div>
  );
}
