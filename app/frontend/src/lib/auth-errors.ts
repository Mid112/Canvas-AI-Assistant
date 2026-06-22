import { AuthApiError } from "@/services/auth";

function isNetworkError(error: unknown): boolean {
  return (
    error instanceof TypeError &&
    (error.message === "Failed to fetch" ||
      error.message.includes("NetworkError"))
  );
}

export function getRegisterErrorMessage(error: unknown): string {
  if (error instanceof AuthApiError) {
    if (error.status === 400) {
      return "An account with this email already exists.";
    }

    if (error.status === 422) {
      return "Please check your name, email, and password and try again.";
    }

    if (error.status === 404) {
      return "The server endpoint was not found. Make sure the backend is running.";
    }

    if (error.status >= 500) {
      return "The server encountered an error. Make sure the database is running.";
    }

    if (error.message) {
      return error.message;
    }
  }

  if (isNetworkError(error)) {
    return "Cannot reach the server. Start the backend with: docker compose -f docker-compose.dev.yml up";
  }

  return "Unable to create account. Please try again.";
}
