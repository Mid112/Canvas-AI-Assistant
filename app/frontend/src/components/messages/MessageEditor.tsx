import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { useEffect, useRef } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { MessageDraftFormSchema } from "./messageDraftSchema";

interface MessageEditorProps {
  register: UseFormRegister<MessageDraftFormSchema>;
  errors: FieldErrors<MessageDraftFormSchema>;
  bodyValue: string;
  hasUnsavedChanges?: boolean;
  showCharacterCount?: boolean;
  disabled?: boolean;
}

export function MessageEditor({
  register,
  errors,
  bodyValue,
  hasUnsavedChanges = false,
  showCharacterCount = true,
  disabled = false,
}: MessageEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { ref: bodyRegisterRef, ...bodyRegister } = register("body");

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [bodyValue]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Review and edit the AI-generated message before sending.
        </p>
        {hasUnsavedChanges ? (
          <span className="text-xs font-medium text-amber-600">Unsaved changes</span>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="message-subject">Subject</Label>
        <Input
          id="message-subject"
          aria-invalid={Boolean(errors.subject)}
          aria-describedby={errors.subject ? "message-subject-error" : undefined}
          disabled={disabled}
          className="bg-white"
          {...register("subject")}
        />
        {errors.subject ? (
          <p
            id="message-subject-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.subject.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="message-body">Message body</Label>
          {showCharacterCount ? (
            <span
              className={cn(
                "text-xs text-muted-foreground",
                bodyValue.length > 5000 && "text-destructive",
              )}
            >
              {bodyValue.length.toLocaleString()} / 5,000
            </span>
          ) : null}
        </div>
        <Textarea
          id="message-body"
          aria-invalid={Boolean(errors.body)}
          aria-describedby={errors.body ? "message-body-error" : undefined}
          disabled={disabled}
          className="min-h-64 resize-none overflow-hidden bg-white"
          ref={(element) => {
            bodyRegisterRef(element);
            textareaRef.current = element;
          }}
          {...bodyRegister}
        />
        {errors.body ? (
          <p
            id="message-body-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {errors.body.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
