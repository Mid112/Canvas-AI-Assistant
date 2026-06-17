import { AuthApiError } from "@/services/auth";

const DEFAULT_VALIDATION_MESSAGE = "Please check your information and try again.";

export function getLoginErrorMessage(err: unknown): string {
  return getAuthErrorMessage(err, "Unable to sign in. Please try again.", {
    401: "Invalid email or password.",
    403: "Account is disabled. Please contact support.",
  });
}

export function getRegisterErrorMessage(err: unknown): string {
  return getAuthErrorMessage(err, "Unable to create account. Please try again.", {
    400: "An account with this email already exists.",
  });
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
