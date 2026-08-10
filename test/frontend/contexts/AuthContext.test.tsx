import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  AuthProvider,
  useAuth,
} from "@/contexts/AuthContext";
import {
  clearStoredToken,
  getStoredToken,
  setStoredToken,
} from "@/lib/auth-storage";
import {
  fetchCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
} from "@/services/auth";
import type { User } from "@/types/user";

vi.mock("@/lib/auth-storage", () => ({
  getStoredToken: vi.fn(),
  setStoredToken: vi.fn(),
  clearStoredToken: vi.fn(),
}));

vi.mock("@/services/auth", () => ({
  loginUser: vi.fn(),
  registerUser: vi.fn(),
  fetchCurrentUser: vi.fn(),
  logoutUser: vi.fn(),
  AuthApiError: class AuthApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

const mockedGetStoredToken = vi.mocked(getStoredToken);
const mockedSetStoredToken = vi.mocked(setStoredToken);
const mockedClearStoredToken = vi.mocked(clearStoredToken);
const mockedLoginUser = vi.mocked(loginUser);
const mockedRegisterUser = vi.mocked(registerUser);
const mockedFetchCurrentUser = vi.mocked(fetchCurrentUser);
const mockedLogoutUser = vi.mocked(logoutUser);

const mockUserResponse = {
  id: 1,
  email: "professor@university.edu",
  name: "Dr. Jane Smith",
  role: "instructor",
  is_active: true,
  canvas_connections: [],
  has_canvas_token: false,
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetStoredToken.mockReturnValue(null);
  });

  // Verifies: Throws when useAuth is used outside AuthProvider.
  it("throws when useAuth is used outside AuthProvider", () => {
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow("useAuth must be used within an AuthProvider");
  });

  // Verifies: Starts unauthenticated when no token is stored.
  it("starts unauthenticated when no token is stored", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.accessToken).toBeNull();
  });

  // Verifies: Loads the current user when a stored token exists.
  it("loads the current user when a stored token exists", async () => {
    mockedGetStoredToken.mockReturnValue("stored-token");
    mockedFetchCurrentUser.mockResolvedValue(mockUserResponse);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockedFetchCurrentUser).toHaveBeenCalledWith("stored-token");
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.accessToken).toBe("stored-token");
    expect(result.current.user).toEqual({
      id: 1,
      email: "professor@university.edu",
      name: "Dr. Jane Smith",
      role: "instructor",
      is_active: true,
      has_canvas_token: false,
      // AuthContext preserves Canvas connection metadata so downstream pages
      // can call the correct Canvas host without another /auth/me request.
      canvas_connections: [],
    });
  });

  // Verifies: Clears an invalid stored token on mount.
  it("clears an invalid stored token on mount", async () => {
    mockedGetStoredToken.mockReturnValue("invalid-token");
    mockedFetchCurrentUser.mockRejectedValue(new Error("Unauthorized"));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockedClearStoredToken).toHaveBeenCalledTimes(1);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.accessToken).toBeNull();
  });

  // Verifies: Clears auth state when /auth/me returns an unsupported role.
  it("clears auth state when /auth/me returns an unsupported role", async () => {
    mockedGetStoredToken.mockReturnValue("stored-token");
    mockedFetchCurrentUser.mockResolvedValue({
      ...mockUserResponse,
      role: "ta",
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockedClearStoredToken).toHaveBeenCalledTimes(1);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.accessToken).toBeNull();
  });

  // Verifies: Logs in and stores the token.
  it("logs in and stores the token", async () => {
    mockedLoginUser.mockResolvedValue({
      access_token: "new-token",
      token_type: "bearer",
    });
    mockedFetchCurrentUser.mockResolvedValue({
      ...mockUserResponse,
      id: 2,
      email: "user@university.edu",
      name: "Test User",
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login({
        email: "user@university.edu",
        password: "secret123",
      });
    });

    expect(mockedLoginUser).toHaveBeenCalledWith({
      email: "user@university.edu",
      password: "secret123",
    });
    expect(mockedSetStoredToken).toHaveBeenCalledWith("new-token");
    expect(result.current.accessToken).toBe("new-token");
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe("user@university.edu");
  });

  // Verifies: Refreshes the current user after login.
  it("refreshes the current user after login", async () => {
    mockedLoginUser.mockResolvedValue({
      access_token: "new-token",
      token_type: "bearer",
    });
    // First response represents login before Canvas is connected; second response
    // proves refreshUser replaces derived Canvas state from a fresh /auth/me read.
    mockedFetchCurrentUser
      .mockResolvedValueOnce({
        ...mockUserResponse,
        has_canvas_token: false,
        canvas_connections: [],
      })
      .mockResolvedValueOnce({
        ...mockUserResponse,
        has_canvas_token: true,
        canvas_connections: [
          {
            id: 1,
            canvas_url: "http://localhost:3000",
            created_at: "2026-06-26T00:00:00.000Z",
          },
        ],
      });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.login({
        email: "professor@university.edu",
        password: "secret123",
      });
    });

    await act(async () => {
      await result.current.refreshUser();
    });

    expect(mockedFetchCurrentUser).toHaveBeenCalledTimes(2);
    expect(mockedFetchCurrentUser).toHaveBeenLastCalledWith("new-token");
    expect(result.current.user?.has_canvas_token).toBe(true);
    expect(result.current.user?.canvas_connections).toEqual([
      {
        id: 1,
        canvas_url: "http://localhost:3000",
        created_at: "2026-06-26T00:00:00.000Z",
      },
    ]);
  });

  // Verifies: Returns null from refreshUser when there is no access token.
  it("returns null from refreshUser when there is no access token", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Without a token, refreshUser should be a harmless no-op for callers that
    // invoke it defensively from onboarding or other profile update flows.
    let refreshedUser: User | null | undefined;
    await act(async () => {
      refreshedUser = await result.current.refreshUser();
    });

    expect(refreshedUser).toBeNull();
    expect(mockedFetchCurrentUser).not.toHaveBeenCalled();
  });

  // Verifies: Registers and stores the token.
  it("registers and stores the token", async () => {
    mockedRegisterUser.mockResolvedValue({
      access_token: "register-token",
      token_type: "bearer",
    });
    mockedFetchCurrentUser.mockResolvedValue({
      ...mockUserResponse,
      id: 3,
      email: "new@university.edu",
      name: "New User",
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.register({
        name: "New User",
        email: "new@university.edu",
        password: "secret123",
      });
    });

    expect(mockedRegisterUser).toHaveBeenCalledWith({
      name: "New User",
      email: "new@university.edu",
      password: "secret123",
    });
    expect(mockedSetStoredToken).toHaveBeenCalledWith("register-token");
    expect(result.current.accessToken).toBe("register-token");
    expect(result.current.user?.email).toBe("new@university.edu");
  });

  // Verifies: Logs out, revokes the server session, and clears auth state.
  it("logs out and clears auth state", async () => {
    mockedGetStoredToken.mockReturnValue("stored-token");
    mockedFetchCurrentUser.mockResolvedValue(mockUserResponse);
    mockedLogoutUser.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    act(() => {
      void result.current.logout();
    });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(false);
    });

    expect(mockedClearStoredToken).toHaveBeenCalledTimes(1);
    expect(mockedLogoutUser).toHaveBeenCalledWith("stored-token");
    expect(result.current.user).toBeNull();
    expect(result.current.accessToken).toBeNull();
  });

  // Verifies: Ticket 37 — local logout still succeeds if session revoke fails.
  it("clears local auth even when logout API fails", async () => {
    mockedGetStoredToken.mockReturnValue("stored-token");
    mockedFetchCurrentUser.mockResolvedValue(mockUserResponse);
    mockedLogoutUser.mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    act(() => {
      void result.current.logout();
    });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(false);
    });

    expect(result.current.accessToken).toBeNull();
  });

  // Verifies: revoke is attempted before local auth is cleared.
  it("awaits server revoke before clearing local auth", async () => {
    mockedGetStoredToken.mockReturnValue("stored-token");
    mockedFetchCurrentUser.mockResolvedValue(mockUserResponse);

    let revokeStarted = false;
    let clearedBeforeRevokeFinished = false;
    mockedLogoutUser.mockImplementation(async () => {
      revokeStarted = true;
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    mockedClearStoredToken.mockImplementation(() => {
      if (revokeStarted) {
        clearedBeforeRevokeFinished = true;
      }
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(mockedLogoutUser).toHaveBeenCalledWith("stored-token");
    expect(clearedBeforeRevokeFinished).toBe(true);
  });
});
