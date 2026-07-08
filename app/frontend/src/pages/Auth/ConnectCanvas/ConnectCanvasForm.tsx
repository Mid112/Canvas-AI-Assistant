import { Plus, X } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeCanvasUrl, validateCanvasUrl } from "@/lib/canvas-url";
import { useCanvasTokenValidation } from "@/lib/useCanvasTokenValidation";
import {
  ConnectCanvasTokenStatus,
  type TokenValidationState,
} from "@/pages/Auth/ConnectCanvas/ConnectCanvasTokenStatus";
import type { CanvasConnectionInput } from "@/services/canvas";

interface ConnectCanvasFormProps {
  accessToken: string | null;
  error?: string | null;
  isSubmitting?: boolean;
  onSessionExpired?: () => void;
  onSubmit: (values: { connections: CanvasConnectionInput[] }) => void | Promise<void>;
  onSkip: () => void | Promise<void>;
}

interface ConnectionEntry {
  id: string;
  canvasUrl: string;
  canvasToken: string;
  validation: TokenValidationState;
}

const inputClassName =
  "h-11 rounded-lg border-[#e2e8f0] bg-white px-3.5 text-[#1e293b] shadow-none placeholder:text-[#94a3b8]";

const labelClassName = "text-sm font-semibold text-[#1e293b]";

function createConnectionEntry(): ConnectionEntry {
  return {
    id: crypto.randomUUID(),
    canvasUrl: "",
    canvasToken: "",
    validation: { status: "idle" },
  };
}

function getInstitutionLabel(index: number): string {
  if (index === 0) {
    return "Institution";
  }

  return `Institution ${index + 1}`;
}

function isTokenValidationComplete(
  token: string,
  validation: TokenValidationState,
): boolean {
  const trimmedToken = token.trim();

  if (trimmedToken === "") {
    return true;
  }

  return validation.status === "valid";
}

interface ConnectCanvasConnectionEntryProps {
  entry: ConnectionEntry;
  index: number;
  accessToken: string | null;
  isSubmitting: boolean;
  canRemove: boolean;
  onSessionExpired?: () => void;
  onFieldChange: (
    id: string,
    field: "canvasUrl" | "canvasToken",
    value: string,
  ) => void;
  onValidationChange: (id: string, validation: TokenValidationState) => void;
  onRemove: (id: string) => void;
}

function ConnectCanvasConnectionEntry({
  entry,
  index,
  accessToken,
  isSubmitting,
  canRemove,
  onSessionExpired,
  onFieldChange,
  onValidationChange,
  onRemove,
}: ConnectCanvasConnectionEntryProps) {
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
    <div className="space-y-4 rounded-xl border border-[#e2e8f0] bg-[#f8fafc]/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#1e293b]">
          {getInstitutionLabel(index)}
        </p>
        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove institution ${index + 1}`}
            disabled={isSubmitting}
            onClick={() => onRemove(entry.id)}
            className="size-8 text-[#94a3b8] hover:text-[#64748b]"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor={`canvas-url-${entry.id}`} className={labelClassName}>
          Canvas URL
        </label>
        <Input
          id={`canvas-url-${entry.id}`}
          type="url"
          autoComplete="url"
          placeholder="https://canvas.university.edu"
          value={entry.canvasUrl}
          onChange={(event) =>
            onFieldChange(entry.id, "canvasUrl", event.target.value)
          }
          aria-invalid={Boolean(urlError)}
          aria-describedby={urlError ? `canvas-url-error-${entry.id}` : undefined}
          className={inputClassName}
        />
        {urlError ? (
          <p
            id={`canvas-url-error-${entry.id}`}
            role="alert"
            className="text-sm text-[#dc2626]"
          >
            {urlError}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label htmlFor={`canvas-token-${entry.id}`} className={labelClassName}>
          Canvas API Token
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
            validation.status !== "idle"
              ? `canvas-token-status-${entry.id}`
              : undefined
          }
          className={inputClassName}
        />
        <div id={`canvas-token-status-${entry.id}`}>
          <ConnectCanvasTokenStatus validation={validation} />
        </div>
      </div>
    </div>
  );
}

export function ConnectCanvasForm({
  accessToken,
  error = null,
  isSubmitting = false,
  onSessionExpired,
  onSubmit,
  onSkip,
}: ConnectCanvasFormProps) {
  const [entries, setEntries] = useState<ConnectionEntry[]>(() => [
    createConnectionEntry(),
  ]);

  const completedConnections = entries
    .map((entry) => ({
      canvasUrl: normalizeCanvasUrl(entry.canvasUrl),
      canvasToken: entry.canvasToken.trim(),
    }))
    .filter((connection) => connection.canvasToken !== "");

  const isValidatingTokens = entries.some((entry) => {
    const trimmedToken = entry.canvasToken.trim();
    return trimmedToken !== "" && entry.validation.status === "validating";
  });

  const allConnectionsValid = entries.every((entry) => {
    const trimmedToken = entry.canvasToken.trim();

    if (trimmedToken === "") {
      return true;
    }

    return (
      validateCanvasUrl(entry.canvasUrl) === null &&
      isTokenValidationComplete(entry.canvasToken, entry.validation)
    );
  });

  const canConnect =
    completedConnections.length > 0 &&
    allConnectionsValid &&
    !isValidatingTokens &&
    !isSubmitting;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canConnect) {
      return;
    }

    await onSubmit({ connections: completedConnections });
  };

  const handleSkip = async () => {
    if (isSubmitting) {
      return;
    }

    await onSkip();
  };

  const updateField = (
    id: string,
    field: "canvasUrl" | "canvasToken",
    value: string,
  ) => {
    setEntries((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry,
      ),
    );
  };

  const updateValidation = useCallback(
    (id: string, validation: TokenValidationState) => {
      setEntries((current) => {
        let changed = false;
        const next = current.map((entry) => {
          if (entry.id !== id || entry.validation.status === validation.status) {
            return entry;
          }

          changed = true;
          return { ...entry, validation };
        });

        return changed ? next : current;
      });
    },
    [],
  );

  const addConnectionField = () => {
    setEntries((current) => [...current, createConnectionEntry()]);
  };

  const removeConnectionField = (id: string) => {
    setEntries((current) =>
      current.length === 1
        ? current
        : current.filter((entry) => entry.id !== id),
    );
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-4">
        {entries.map((entry, index) => (
          <ConnectCanvasConnectionEntry
            key={entry.id}
            entry={entry}
            index={index}
            accessToken={accessToken}
            isSubmitting={isSubmitting}
            canRemove={entries.length > 1}
            onSessionExpired={onSessionExpired}
            onFieldChange={updateField}
            onValidationChange={updateValidation}
            onRemove={removeConnectionField}
          />
        ))}

        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={addConnectionField}
          className="h-10 w-full rounded-lg border-[#e2e8f0] bg-white text-sm font-medium text-[#475569] hover:bg-[#f8fafc]"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add another institution
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-[#dc2626]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        <Button
          type="submit"
          disabled={!canConnect}
          className="h-11 w-full rounded-lg bg-[#2563eb] text-base font-semibold text-white shadow-[0_4px_14px_rgba(37,99,235,0.35)] hover:bg-[#1d4ed8] disabled:bg-[#cbd5e1] disabled:text-[#94a3b8] disabled:shadow-none disabled:hover:bg-[#cbd5e1]"
        >
          {isSubmitting ? "Connecting..." : "Connect Canvas"}
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={handleSkip}
          className="h-11 w-full rounded-lg border-[#e2e8f0] bg-white text-base font-semibold text-[#475569] hover:bg-[#f8fafc]"
        >
          Continue without connecting
        </Button>
        <p className="text-center text-xs leading-relaxed text-[#94a3b8]">
          Skip Canvas connection to use the query assistant only, without
          institution workflows.
        </p>
      </div>
    </form>
  );
}
