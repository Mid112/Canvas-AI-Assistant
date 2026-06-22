import { AuthApiError } from "@/services/auth";

const DEFAULT_VALIDATION_MESSAGE = "Please check your information and try again.";

function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    (error.message === "Failed to fetch" ||
      error.message.includes("NetworkError"))
  );
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

  if (err instanceof AuthApiError) {
    if (err.status === 400) {
      return "An account with this email already exists.";
    }

    if (err.status === 404) {
      return "The server endpoint was not found. Make sure the backend is running.";
    }

    if (err.status >= 500) {
      return "The server encountered an error. Make sure the database is running.";
    }

    if (err.status === 422) {
      return err.message === "Something went wrong. Please try again."
        ? DEFAULT_VALIDATION_MESSAGE
        : err.message;
    }

    if (err.message) {
      return err.message;
    }
  }

  return "Unable to create account. Please try again.";
}

function getAuthErrorMessage(
  err: unknown,
  fallback: string,
  statusMessages: Record<number, string>,
): string {
  if (!(err instanceof AuthApiError)) {
    return fallback;
  }

  if (statusMessages[err.status]) {
    return statusMessages[err.status];
  }

  if (err.status === 422) {
    return err.message === "Something went wrong. Please try again."
      ? DEFAULT_VALIDATION_MESSAGE
      : err.message;
  }

  return fallback;
}
