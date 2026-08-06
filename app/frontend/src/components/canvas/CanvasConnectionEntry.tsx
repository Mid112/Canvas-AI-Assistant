import { X } from "lucide-react";
import { useLayoutEffect, useRef } from "react";

import {
  canvasConnectionInputClassName,
  canvasConnectionLabelClassName,
  getCanvasInstitutionLabel,
  type CanvasConnectionEntryState,
} from "@/components/canvas/canvasConnectionEntryUtils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCanvasTokenValidation } from "@/lib/useCanvasTokenValidation";
import {
  ConnectCanvasTokenStatus,
  type TokenValidationState,
} from "@/pages/Auth/ConnectCanvas/ConnectCanvasTokenStatus";

interface CanvasConnectionEntryProps {
  entry: CanvasConnectionEntryState;
  index: number;
  accessToken: string | null;
  isSubmitting?: boolean;
  canRemove?: boolean;
  urlReadOnly?: boolean;
  tokenLabel?: string;
  tokenOptional?: boolean;
  onSessionExpired?: () => void;
  onFieldChange: (
    id: string,
    field: "canvasUrl" | "canvasToken",
    value: string,
  ) => void;
  onValidationChange: (id: string, validation: TokenValidationState) => void;
  onRemove?: (id: string) => void;
}

export function CanvasConnectionEntry({
  entry,
  index,
  accessToken,
  isSubmitting = false,
  canRemove = false,
  urlReadOnly = false,
  tokenLabel = "Canvas API Token",
  tokenOptional = false,
  onSessionExpired,
  onFieldChange,
  onValidationChange,
  onRemove,
}: CanvasConnectionEntryProps) {
  const { urlError, validation } = useCanvasTokenValidation(
    entry.canvasToken,
    entry.canvasUrl,
    accessToken,
    { onSessionExpired },
  );
  const onValidationChangeRef = useRef(onValidationChange);

  useLayoutEffect(() => {
    onValidationChangeRef.current = onValidationChange;
  }, [onValidationChange]);

  useLayoutEffect(() => {
    onValidationChangeRef.current(entry.id, validation);
  }, [entry.id, validation]);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-muted/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">
          {getCanvasInstitutionLabel(index)}
        </p>
        {canRemove && onRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove institution ${index + 1}`}
            disabled={isSubmitting}
            onClick={() => onRemove(entry.id)}
            className="size-8 text-muted-foreground hover:text-muted-foreground"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <div className="space-y-2">
        <label htmlFor={`canvas-url-${entry.id}`} className={canvasConnectionLabelClassName}>
          Canvas URL
        </label>
        <Input
          id={`canvas-url-${entry.id}`}
          type="url"
          autoComplete="url"
          placeholder="https://canvas.university.edu"
          value={entry.canvasUrl}
          readOnly={urlReadOnly}
          onChange={(event) =>
            onFieldChange(entry.id, "canvasUrl", event.target.value)
          }
          aria-invalid={Boolean(urlError)}
          aria-describedby={urlError ? `canvas-url-error-${entry.id}` : undefined}
          className={canvasConnectionInputClassName}
        />
        {urlError ? (
          <p
            id={`canvas-url-error-${entry.id}`}
            role="alert"
            className="text-sm text-destructive"
          >
            {urlError}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label htmlFor={`canvas-token-${entry.id}`} className={canvasConnectionLabelClassName}>
          {tokenLabel}
          {tokenOptional ? (
            <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
          ) : null}
        </label>
        <Input
          id={`canvas-token-${entry.id}`}
          type="password"
          autoComplete="off"
          placeholder="Paste your Canvas access token"
          value={entry.canvasToken}
          onChange={(event) =>
            onFieldChange(entry.id, "canvasToken", event.target.value)
          }
          aria-describedby={
            validation.status !== "idle" ? `canvas-token-status-${entry.id}` : undefined
          }
          className={canvasConnectionInputClassName}
        />
        <div id={`canvas-token-status-${entry.id}`}>
          <ConnectCanvasTokenStatus validation={validation} />
        </div>
      </div>
    </div>
  );
}
