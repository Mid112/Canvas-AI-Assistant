import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStoredToken } from "@/lib/auth-storage";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import {
  ConnectCanvasTokenStatus,
  type TokenValidationState,
} from "@/pages/Auth/ConnectCanvas/ConnectCanvasTokenStatus";
import { validateCanvasToken } from "@/services/canvas";

interface ConnectCanvasFormProps {
  error?: string | null;
  isSubmitting?: boolean;
  onSubmit: (values: { canvasTokens: string[] }) => void | Promise<void>;
  onSkip: () => void | Promise<void>;
}

const inputClassName =
  "h-11 rounded-lg border-[#e2e8f0] bg-white px-3.5 text-[#1e293b] shadow-none placeholder:text-[#94a3b8]";

const labelClassName = "text-sm font-semibold text-[#1e293b]";

const VALIDATION_DEBOUNCE_MS = 500;

function getTokenLabel(index: number): string {
  if (index === 0) {
    return "Canvas API Token";
  }

  return `Canvas API Token (Institution ${index + 1})`;
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
  error = null,
  isSubmitting = false,
  onSubmit,
  onSkip,
}: ConnectCanvasFormProps) {
  const [canvasTokens, setCanvasTokens] = useState<string[]>([""]);
  const [validationStates, setValidationStates] = useState<
    TokenValidationState[]
  >(() => createIdleValidationStates(1));
  const debouncedTokens = useDebouncedValue(canvasTokens, VALIDATION_DEBOUNCE_MS);
  const validationRequestIds = useRef<number[]>([0]);
  const prevDebouncedTokens = useRef<string[]>([]);

  const nonEmptyTokens = canvasTokens
    .map((token) => token.trim())
    .filter((token) => token !== "");

  const isValidatingTokens = canvasTokens.some((token, index) => {
    const trimmedToken = token.trim();
    return trimmedToken !== "" && validationStates[index]?.status === "validating";
  });

  const allEnteredTokensValid = canvasTokens.every((token, index) =>
    isTokenValidationComplete(token, validationStates[index] ?? { status: "idle" }),
  );

  const canConnect =
    nonEmptyTokens.length > 0 &&
    allEnteredTokensValid &&
    !isValidatingTokens &&
    !isSubmitting;

  useEffect(() => {
    setValidationStates((current) => {
      if (current.length === canvasTokens.length) {
        return current;
      }

      return canvasTokens.map(
        (_, index) => current[index] ?? { status: "idle" },
      );
    });

    validationRequestIds.current = canvasTokens.map(
      (_, index) => validationRequestIds.current[index] ?? 0,
    );
  }, [canvasTokens.length]);

  useEffect(() => {
    debouncedTokens.forEach((token, index) => {
      if (prevDebouncedTokens.current[index] === token) {
        return;
      }

      const trimmedToken = token.trim();

      if (trimmedToken === "") {
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

      void (async () => {
        try {
          const accessToken = getStoredToken();
          if (!accessToken) {
            if (validationRequestIds.current[index] !== requestId) {
              return;
            }

            setValidationStates((current) =>
              current.map((state, stateIndex) =>
                stateIndex === index ? { status: "invalid" } : state,
              ),
            );
            return;
          }

          const status = await validateCanvasToken(trimmedToken, accessToken);

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

    prevDebouncedTokens.current = debouncedTokens;
  }, [debouncedTokens]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canConnect) {
      return;
    }

    await onSubmit({ canvasTokens: nonEmptyTokens });
  };

  const handleSkip = async () => {
    if (isSubmitting) {
      return;
    }

    await onSkip();
  };

  const updateToken = (index: number, value: string) => {
    setCanvasTokens((current) =>
      current.map((token, tokenIndex) =>
        tokenIndex === index ? value : token,
      ),
    );

    if (value.trim() === "") {
      setValidationStates((current) =>
        current.map((state, stateIndex) =>
          stateIndex === index ? { status: "idle" } : state,
        ),
      );
    }
  };

  const addTokenField = () => {
    setCanvasTokens((current) => [...current, ""]);
    setValidationStates((current) => [...current, { status: "idle" }]);
    validationRequestIds.current = [...validationRequestIds.current, 0];
  };

  const removeTokenField = (index: number) => {
    setCanvasTokens((current) =>
      current.length === 1
        ? current
        : current.filter((_, tokenIndex) => tokenIndex !== index),
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
        {canvasTokens.map((token, index) => (
          <div key={index} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`canvas-token-${index}`} className={labelClassName}>
                {getTokenLabel(index)}
                {index === 0 && (
                  <span className="ml-1 font-normal text-[#94a3b8]">
                    (optional)
                  </span>
                )}
              </label>
              {canvasTokens.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove institution ${index + 1}`}
                  disabled={isSubmitting}
                  onClick={() => removeTokenField(index)}
                  className="size-8 text-[#94a3b8] hover:text-[#64748b]"
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>
            <Input
              id={`canvas-token-${index}`}
              type="password"
              autoComplete="off"
              placeholder="Paste your Canvas access token"
              value={token}
              onChange={(event) => updateToken(index, event.target.value)}
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
        ))}

        <Button
          type="button"
          variant="outline"
          disabled={isSubmitting}
          onClick={addTokenField}
          className="h-10 w-full rounded-lg border-[#e2e8f0] bg-white text-sm font-medium text-[#475569] hover:bg-[#f8fafc]"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add another institution
        </Button>
      </div>

      {error && (
        <p className="text-sm text-[#dc2626]" role="alert">
          {error}
        </p>
      )}

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
