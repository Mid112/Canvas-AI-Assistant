import {
  AuthApiError,
  DEFAULT_VALIDATION_MESSAGE,
  GENERIC_AUTH_ERROR_MESSAGE,
} from "@/services/auth";

function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    (error.message === "Failed to fetch" ||
      error.message.includes("NetworkError"))
  );
}

function getValidationErrorMessage(message: string): string {
  return message === GENERIC_AUTH_ERROR_MESSAGE
    ? DEFAULT_VALIDATION_MESSAGE
    : message;
}

export function getLoginErrorMessage(err: unknown): string {
  return getAuthErrorMessage(err, "Unable to sign in. Please try again.", {
    401: "Invalid email or password.",
    403: "Account is disabled. Please contact support.",
  });
}

export function getRegisterErrorMessage(err: unknown): string {
  if (isNetworkError(err)) {
    return "Cannot reach the server. Start the backend with: docker compose -f docker-compose.dev.yml up";
  }

  if (err instanceof AuthApiError && err.status >= 500) {
    return "The server encountered an error. Make sure the database is running.";
  }

  return getAuthErrorMessage(
    err,
    "Unable to create account. Please try again.",
    {
      400: "An account with this email already exists.",
      404: "The server endpoint was not found. Make sure the backend is running.",
    },
    { useMessageForUnmapped: true },
  );
}

function getAuthErrorMessage(
  err: unknown,
  fallback: string,
  statusMessages: Record<number, string>,
  options?: { useMessageForUnmapped?: boolean },
): string {
  if (!(err instanceof AuthApiError)) {
    return fallback;
  }

  if (statusMessages[err.status]) {
    return statusMessages[err.status];
  }

  if (err.status === 422) {
    return getValidationErrorMessage(err.message);
  }

  if (options?.useMessageForUnmapped && err.message) {
    return err.message;
  }

  return fallback;
}
