import { useEffect, useRef, useState } from "react";

import { normalizeCanvasUrl, validateCanvasUrl } from "@/lib/canvas-url";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import type { TokenValidationState } from "@/pages/Auth/ConnectCanvas/ConnectCanvasTokenStatus";
import type { CanvasTokenValidationStatus } from "@/types/canvas";
import { validateCanvasToken } from "@/services/canvas";

const DEFAULT_DEBOUNCE_MS = 500;

interface UseCanvasTokenValidationOptions {
  debounceMs?: number;
  onSessionExpired?: () => void;
}

export function useCanvasTokenValidation(
  token: string,
  url: string,
  accessToken: string | null,
  options?: UseCanvasTokenValidationOptions,
): { urlError: string | null; validation: TokenValidationState } {
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const debounced = useDebouncedValue({ token, url }, debounceMs);
  const validationRequestId = useRef(0);
  const onSessionExpiredRef = useRef(options?.onSessionExpired);
  const [validatedKey, setValidatedKey] = useState<string | null>(null);
  const [tokenStatus, setTokenStatus] =
    useState<CanvasTokenValidationStatus>("invalid");

  useEffect(() => {
    onSessionExpiredRef.current = options?.onSessionExpired;
  }, [options?.onSessionExpired]);

  const urlError = validateCanvasUrl(url);
  const debouncedUrlError = validateCanvasUrl(debounced.url);
  const debouncedToken = debounced.token.trim();
  const debouncedUrl = normalizeCanvasUrl(debounced.url);
  const validationKey = `${debouncedUrl}:${debouncedToken}`;
  const debouncedInputsReady =
    debouncedToken !== "" && debouncedUrlError === null;

  const validation: TokenValidationState =
    token.trim() === "" || urlError
      ? { status: "idle" }
      : !debouncedInputsReady
        ? { status: "idle" }
        : !accessToken
          ? { status: "validating" }
          : validatedKey !== validationKey
            ? { status: "validating" }
            : { status: tokenStatus };

  useEffect(() => {
    if (!debouncedInputsReady) {
      return;
    }

    if (!accessToken) {
      onSessionExpiredRef.current?.();
      return;
    }

    const requestId = validationRequestId.current + 1;
    validationRequestId.current = requestId;

    void (async () => {
      try {
        const status = await validateCanvasToken(
          debouncedToken,
          accessToken,
          debouncedUrl,
        );

        if (validationRequestId.current !== requestId) {
          return;
        }

        setValidatedKey(validationKey);
        setTokenStatus(status);
      } catch {
        if (validationRequestId.current !== requestId) {
          return;
        }

        setValidatedKey(validationKey);
        setTokenStatus("invalid");
      }
    })();
  }, [
    accessToken,
    debouncedInputsReady,
    debouncedToken,
    debouncedUrl,
    validationKey,
  ]);

  return { urlError, validation };
}
