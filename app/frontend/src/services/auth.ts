import { API_BASE_URL } from "@/config/api";
import type {
  LoginCredentials,
  ChangePasswordPayload,
  NotificationSettings,
  ProfileUpdatePayload,
  RegisterCredentials,
  SecurityStatusResponse,
  SessionResponse,
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

type ValidationErrorItem = {
  loc?: (string | number)[];
  msg?: string;
};

export const DEFAULT_VALIDATION_MESSAGE =
  "Please check your information and try again.";
export const GENERIC_AUTH_ERROR_MESSAGE =
  "Something went wrong. Please try again.";

function formatValidationErrors(errors: ValidationErrorItem[]): string {
  for (const error of errors) {
    const field = error.loc?.find((part) => part !== "body");
    if (field === "email") {
      return "Enter a valid email address.";
    }
    if (field === "password") {
      return "Please enter a valid password.";
    }
  }

  return DEFAULT_VALIDATION_MESSAGE;
}

async function parseError(response: Response): Promise<string> {
  if (response.status === 404) {
    return "The requested API endpoint was not found. Make sure the backend is running.";
  }

  try {
    const data = (await response.json()) as {
      detail?: string | ValidationErrorItem[];
    };
    if (typeof data.detail === "string") {
      return data.detail;
    }
    if (Array.isArray(data.detail) && data.detail.length > 0) {
      return formatValidationErrors(data.detail);
    }
  } catch {
    // Fall through to default message.
  }

  return GENERIC_AUTH_ERROR_MESSAGE;
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

  if (response.status === 204) {
    return undefined as T;
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

export async function updateCurrentUser(
  token: string,
  payload: ProfileUpdatePayload,
): Promise<UserResponse> {
  return request<UserResponse>(
    "/auth/me",
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
}

export async function deleteCurrentUser(
  token: string,
  password: string,
): Promise<void> {
  return request<void>(
    "/auth/me",
    {
      method: "DELETE",
      body: JSON.stringify({ password }),
    },
    token,
  );
}

export async function changeCurrentPassword(
  token: string,
  payload: ChangePasswordPayload,
): Promise<void> {
  return request<void>(
    "/auth/me/change-password",
    {
      method: "POST",
      body: JSON.stringify({
        current_password: payload.currentPassword,
        new_password: payload.newPassword,
      }),
    },
    token,
  );
}

export async function fetchNotificationSettings(
  token: string,
): Promise<NotificationSettings> {
  return request<NotificationSettings>(
    "/auth/me/notifications",
    { method: "GET" },
    token,
  );
}

export async function updateNotificationSettings(
  token: string,
  settings: NotificationSettings,
): Promise<NotificationSettings> {
  return request<NotificationSettings>(
    "/auth/me/notifications",
    {
      method: "PATCH",
      body: JSON.stringify({ settings }),
    },
    token,
  );
}

export async function fetchUserSessions(
  token: string,
): Promise<SessionResponse[]> {
  return request<SessionResponse[]>(
    "/auth/me/sessions",
    { method: "GET" },
    token,
  );
}

export async function revokeUserSession(
  token: string,
  sessionId: number,
): Promise<void> {
  return request<void>(
    `/auth/me/sessions/${sessionId}`,
    { method: "DELETE" },
    token,
  );
}

export async function fetchSecurityStatus(
  token: string,
): Promise<SecurityStatusResponse> {
  return request<SecurityStatusResponse>(
    "/auth/me/security",
    { method: "GET" },
    token,
  );
}

export { AuthApiError };
