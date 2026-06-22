import { API_BASE_URL } from "@/config/api";
import type {
  LoginCredentials,
  RegisterCredentials,
  TokenResponse,
  UserResponse,
} from "@/types/auth";

class AuthApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
  }
}

async function parseError(response: Response): Promise<string> {
  if (response.status === 404) {
    return "The requested API endpoint was not found. Make sure the backend is running.";
  }

  try {
    const data = (await response.json()) as {
      detail?: string | Array<{ msg?: string }>;
    };

    if (typeof data.detail === "string") {
      return data.detail;
    }

    if (Array.isArray(data.detail) && data.detail.length > 0) {
      const firstMessage = data.detail.find(
        (item) => typeof item.msg === "string",
      )?.msg;

      if (firstMessage) {
        return firstMessage;
      }
    }
  } catch {
    // Fall through to default message.
  }

  return "Something went wrong. Please try again.";
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new AuthApiError(await parseError(response), response.status);
  }

  return response.json() as Promise<T>;
}

export async function loginUser(
  credentials: LoginCredentials,
): Promise<TokenResponse> {
  return request<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

export async function registerUser(
  credentials: RegisterCredentials,
): Promise<TokenResponse> {
  return request<TokenResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

export async function fetchCurrentUser(token: string): Promise<UserResponse> {
  return request<UserResponse>("/auth/me", { method: "GET" }, token);
}

export { AuthApiError };
