import { useEffect, useRef, useState } from "react";

import { normalizeCanvasUrl, validateCanvasUrl } from "@/lib/canvas-url";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import type { TokenValidationState } from "@/pages/Auth/ConnectCanvas/ConnectCanvasTokenStatus";
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
  const [validation, setValidation] = useState<TokenValidationState>({
    status: "idle",
  });

  useEffect(() => {
    onSessionExpiredRef.current = options?.onSessionExpired;
  }, [options?.onSessionExpired]);

  const urlError = validateCanvasUrl(url);

  useEffect(() => {
    if (token.trim() === "") {
      setValidation({ status: "idle" });
    }
  }, [token]);

  useEffect(() => {
    const trimmedToken = debounced.token.trim();
    const trimmedUrl = normalizeCanvasUrl(debounced.url);
    const debouncedUrlError = validateCanvasUrl(debounced.url);

    if (trimmedToken === "" || debouncedUrlError) {
      setValidation({ status: "idle" });
      return;
    }

    if (!accessToken) {
      onSessionExpiredRef.current?.();
      return;
    }

    const requestId = validationRequestId.current + 1;
    validationRequestId.current = requestId;

    setValidation({ status: "validating" });

    void (async () => {
      try {
        const status = await validateCanvasToken(
          trimmedToken,
          accessToken,
          trimmedUrl,
        );

        if (validationRequestId.current !== requestId) {
          return;
        }

        setValidation({ status });
      } catch {
        if (validationRequestId.current !== requestId) {
          return;
        }

        setValidation({ status: "invalid" });
      }
    })();
  }, [accessToken, debounced.token, debounced.url]);

  return { urlError, validation };
}
