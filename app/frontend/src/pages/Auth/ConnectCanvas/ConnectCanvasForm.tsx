import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeCanvasUrl, validateCanvasUrl } from "@/lib/canvas-url";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import {
  ConnectCanvasTokenStatus,
  type TokenValidationState,
} from "@/pages/Auth/ConnectCanvas/ConnectCanvasTokenStatus";
import type { CanvasConnectionInput } from "@/services/canvas";
import { validateCanvasToken } from "@/services/canvas";

interface ConnectCanvasFormProps {
  accessToken: string | null;
  error?: string | null;
  isSubmitting?: boolean;
  onSessionExpired?: () => void;
  onSubmit: (values: { connections: CanvasConnectionInput[] }) => void | Promise<void>;
  onSkip: () => void | Promise<void>;
}

interface ConnectionField {
  canvasUrl: string;
  canvasToken: string;
}

const inputClassName =
  "h-11 rounded-lg border-[#e2e8f0] bg-white px-3.5 text-[#1e293b] shadow-none placeholder:text-[#94a3b8]";

const labelClassName = "text-sm font-semibold text-[#1e293b]";

const VALIDATION_DEBOUNCE_MS = 500;

function getInstitutionLabel(index: number): string {
  if (index === 0) {
    return "Institution";
  }

  return `Institution ${index + 1}`;
}

function createIdleValidationStates(count: number): TokenValidationState[] {
  return Array.from({ length: count }, () => ({ status: "idle" }));
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

export function ConnectCanvasForm({
  accessToken,
  error = null,
  isSubmitting = false,
  onSessionExpired,
  onSubmit,
  onSkip,
}: ConnectCanvasFormProps) {
  const [connections, setConnections] = useState<ConnectionField[]>([
    { canvasUrl: "", canvasToken: "" },
  ]);
  const [urlErrors, setUrlErrors] = useState<(string | null)[]>([null]);
  const [validationStates, setValidationStates] = useState<TokenValidationState[]>(
    () => createIdleValidationStates(1),
  );
  const debouncedConnections = useDebouncedValue(
    connections,
    VALIDATION_DEBOUNCE_MS,
  );
  const validationRequestIds = useRef<number[]>([0]);
  const prevDebouncedConnections = useRef<ConnectionField[]>([]);
  const onSessionExpiredRef = useRef(onSessionExpired);

  useEffect(() => {
    onSessionExpiredRef.current = onSessionExpired;
  }, [onSessionExpired]);

  const completedConnections = connections
    .map((connection) => ({
      canvasUrl: normalizeCanvasUrl(connection.canvasUrl),
      canvasToken: connection.canvasToken.trim(),
    }))
    .filter((connection) => connection.canvasToken !== "");

  const isValidatingTokens = connections.some((connection, index) => {
    const trimmedToken = connection.canvasToken.trim();
    return trimmedToken !== "" && validationStates[index]?.status === "validating";
  });

  const allConnectionsValid = connections.every((connection, index) => {
    const trimmedToken = connection.canvasToken.trim();
    const urlError = validateCanvasUrl(connection.canvasUrl);

    if (trimmedToken === "") {
      return true;
    }

    return urlError === null && isTokenValidationComplete(connection.canvasToken, validationStates[index] ?? { status: "idle" });
  });

  const canConnect =
    completedConnections.length > 0 &&
    allConnectionsValid &&
    !isValidatingTokens &&
    !isSubmitting;

  useEffect(() => {
    debouncedConnections.forEach((connection, index) => {
      const previous = prevDebouncedConnections.current[index];
      const tokenChanged = previous?.canvasToken !== connection.canvasToken;
      const urlChanged = previous?.canvasUrl !== connection.canvasUrl;

      if (!tokenChanged && !urlChanged) {
        return;
      }

      const urlError = validateCanvasUrl(connection.canvasUrl);
      setUrlErrors((current) =>
        current.map((value, valueIndex) =>
          valueIndex === index ? urlError : value,
        ),
      );

      const trimmedToken = connection.canvasToken.trim();
      const trimmedUrl = normalizeCanvasUrl(connection.canvasUrl);

      if (trimmedToken === "" || urlError) {
        setValidationStates((current) =>
          current.map((state, stateIndex) =>
            stateIndex === index ? { status: "idle" } : state,
          ),
        );
        return;
      }

      const requestId = (validationRequestIds.current[index] ?? 0) + 1;
      validationRequestIds.current[index] = requestId;

      setValidationStates((current) =>
        current.map((state, stateIndex) =>
          stateIndex === index ? { status: "validating" } : state,
        ),
      );

      if (!accessToken) {
        onSessionExpiredRef.current?.();
        return;
      }

      void (async () => {
        try {
          const status = await validateCanvasToken(
            trimmedToken,
            accessToken,
            trimmedUrl,
          );

          if (validationRequestIds.current[index] !== requestId) {
            return;
          }

          setValidationStates((current) =>
            current.map((state, stateIndex) =>
              stateIndex === index ? { status } : state,
            ),
          );
        } catch {
          if (validationRequestIds.current[index] !== requestId) {
            return;
          }

          setValidationStates((current) =>
            current.map((state, stateIndex) =>
              stateIndex === index ? { status: "invalid" } : state,
            ),
          );
        }
      })();
    });

    prevDebouncedConnections.current = debouncedConnections;
  }, [accessToken, debouncedConnections]);

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

  const updateConnection = (
    index: number,
    field: keyof ConnectionField,
    value: string,
  ) => {
    setConnections((current) =>
      current.map((connection, connectionIndex) =>
        connectionIndex === index
          ? { ...connection, [field]: value }
          : connection,
      ),
    );

    if (field === "canvasUrl") {
      setUrlErrors((current) =>
        current.map((urlError, urlIndex) =>
          urlIndex === index ? validateCanvasUrl(value) : urlError,
        ),
      );
    }

    if (field === "canvasToken" && value.trim() === "") {
      setValidationStates((current) =>
        current.map((state, stateIndex) =>
          stateIndex === index ? { status: "idle" } : state,
        ),
      );
    }
  };

  const addConnectionField = () => {
    setConnections((current) => [...current, { canvasUrl: "", canvasToken: "" }]);
    setUrlErrors((current) => [...current, null]);
    setValidationStates((current) => [...current, { status: "idle" }]);
    validationRequestIds.current = [...validationRequestIds.current, 0];
  };

  const removeConnectionField = (index: number) => {
    setConnections((current) =>
      current.length === 1
        ? current
        : current.filter((_, connectionIndex) => connectionIndex !== index),
    );
    setUrlErrors((current) =>
      current.length === 1
        ? current
        : current.filter((_, urlIndex) => urlIndex !== index),
    );
    setValidationStates((current) =>
      current.length === 1
        ? current
        : current.filter((_, stateIndex) => stateIndex !== index),
    );
    validationRequestIds.current = validationRequestIds.current.filter(
      (_, requestIndex) => requestIndex !== index,
    );
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-4">
        {connections.map((connection, index) => (
          <div
            key={index}
            className="space-y-4 rounded-xl border border-[#e2e8f0] bg-[#f8fafc]/60 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[#1e293b]">
                {getInstitutionLabel(index)}
              </p>
              {connections.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove institution ${index + 1}`}
                  disabled={isSubmitting}
                  onClick={() => removeConnectionField(index)}
                  className="size-8 text-[#94a3b8] hover:text-[#64748b]"
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor={`canvas-url-${index}`} className={labelClassName}>
                Canvas URL
              </label>
              <Input
                id={`canvas-url-${index}`}
                type="url"
                autoComplete="url"
                placeholder="https://canvas.university.edu"
                value={connection.canvasUrl}
                onChange={(event) =>
                  updateConnection(index, "canvasUrl", event.target.value)
                }
                aria-invalid={Boolean(urlErrors[index])}
                aria-describedby={
                  urlErrors[index] ? `canvas-url-error-${index}` : undefined
                }
                className={inputClassName}
              />
              {urlErrors[index] ? (
                <p
                  id={`canvas-url-error-${index}`}
                  role="alert"
                  className="text-sm text-[#dc2626]"
                >
                  {urlErrors[index]}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <label htmlFor={`canvas-token-${index}`} className={labelClassName}>
                Canvas API Token
                {index === 0 && (
                  <span className="ml-1 font-normal text-[#94a3b8]">
                    (optional)
                  </span>
                )}
              </label>
              <Input
                id={`canvas-token-${index}`}
                type="password"
                autoComplete="off"
                placeholder="Paste your Canvas access token"
                value={connection.canvasToken}
                onChange={(event) =>
                  updateConnection(index, "canvasToken", event.target.value)
                }
                aria-describedby={
                  validationStates[index]?.status !== "idle"
                    ? `canvas-token-status-${index}`
                    : undefined
                }
                className={inputClassName}
              />
              <div id={`canvas-token-status-${index}`}>
                <ConnectCanvasTokenStatus
                  validation={validationStates[index] ?? { status: "idle" }}
                />
              </div>
            </div>
          </div>
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
