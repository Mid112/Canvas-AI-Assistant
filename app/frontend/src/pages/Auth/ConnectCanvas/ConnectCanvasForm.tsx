import { Plus } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";

import {
  CanvasConnectionEntry,
  createCanvasConnectionEntry,
  isCanvasTokenValidationComplete,
  type CanvasConnectionEntryState,
} from "@/components/canvas/CanvasConnectionEntry";
import { Button } from "@/components/ui/button";
import { normalizeCanvasUrl, validateCanvasUrl } from "@/lib/canvas-url";
import type { CanvasConnectionInput } from "@/services/canvas";
import type { TokenValidationState } from "@/pages/Auth/ConnectCanvas/ConnectCanvasTokenStatus";

interface ConnectCanvasFormProps {
  accessToken: string | null;
  error?: string | null;
  isSubmitting?: boolean;
  onSessionExpired?: () => void;
  onSubmit: (values: { connections: CanvasConnectionInput[] }) => void | Promise<void>;
  onSkip: () => void | Promise<void>;
}

export function ConnectCanvasForm({
  accessToken,
  error = null,
  isSubmitting = false,
  onSessionExpired,
  onSubmit,
  onSkip,
}: ConnectCanvasFormProps) {
  const [entries, setEntries] = useState<CanvasConnectionEntryState[]>(() => [
    createCanvasConnectionEntry(),
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
      isCanvasTokenValidationComplete(entry.canvasToken, entry.validation)
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
    setEntries((current) => [...current, createCanvasConnectionEntry()]);
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
          <CanvasConnectionEntry
            key={entry.id}
            entry={entry}
            index={index}
            accessToken={accessToken}
            isSubmitting={isSubmitting}
            canRemove={entries.length > 1}
            tokenOptional={index === 0}
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
          className="h-10 w-full rounded-lg border-border bg-card text-sm font-medium text-muted-foreground hover:bg-muted"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add another institution
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="space-y-3">
        <Button
          type="submit"
          disabled={!canConnect}
          className="h-11 w-full text-base font-semibold"
        >
          {isSubmitting ? "Connecting..." : "Connect Canvas"}
        </Button>

        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={handleSkip}
          className="h-11 w-full rounded-lg border-border bg-card text-base font-semibold text-muted-foreground hover:bg-muted"
        >
          Continue without connecting
        </Button>
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          Skip Canvas connection to use the query assistant only, without
          institution workflows.
        </p>
      </div>
    </form>
  );
}
