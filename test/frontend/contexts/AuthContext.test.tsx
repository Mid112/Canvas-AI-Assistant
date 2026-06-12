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
  registerUser,
} from "@/services/auth";

vi.mock("@/lib/auth-storage", () => ({
  getStoredToken: vi.fn(),
  setStoredToken: vi.fn(),
  clearStoredToken: vi.fn(),
}));

vi.mock("@/services/auth", () => ({
  loginUser: vi.fn(),
  registerUser: vi.fn(),
  fetchCurrentUser: vi.fn(),
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

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetStoredToken.mockReturnValue(null);
  });

  it("throws when useAuth is used outside AuthProvider", () => {
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow("useAuth must be used within an AuthProvider");
  });

  it("starts unauthenticated when no token is stored", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("loads the current user when a stored token exists", async () => {
    mockedGetStoredToken.mockReturnValue("stored-token");
    mockedFetchCurrentUser.mockResolvedValue({
      id: 1,
      email: "professor@university.edu",
      name: "Dr. Jane Smith",
      has_canvas_token: false,
      is_active: true,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockedFetchCurrentUser).toHaveBeenCalledWith("stored-token");
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual({
      id: 1,
      email: "professor@university.edu",
      name: "Dr. Jane Smith",
      role: "instructor",
      is_active: true,
      has_canvas_token: false,
    });
  });

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
  });

  it("logs in and stores the token", async () => {
    mockedLoginUser.mockResolvedValue({
      access_token: "new-token",
      token_type: "bearer",
    });
    mockedFetchCurrentUser.mockResolvedValue({
      id: 2,
      email: "user@university.edu",
      name: "Test User",
      has_canvas_token: false,
      is_active: true,
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
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe("user@university.edu");
  });

  it("registers and stores the token", async () => {
    mockedRegisterUser.mockResolvedValue({
      access_token: "register-token",
      token_type: "bearer",
    });
    mockedFetchCurrentUser.mockResolvedValue({
      id: 3,
      email: "new@university.edu",
      name: "New User",
      has_canvas_token: false,
      is_active: true,
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
    expect(result.current.user?.email).toBe("new@university.edu");
  });

  it("logs out and clears auth state", async () => {
    mockedGetStoredToken.mockReturnValue("stored-token");
    mockedFetchCurrentUser.mockResolvedValue({
      id: 1,
      email: "professor@university.edu",
      name: "Dr. Jane Smith",
      has_canvas_token: false,
      is_active: true,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    act(() => {
      result.current.logout();
    });

    expect(mockedClearStoredToken).toHaveBeenCalledTimes(1);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });
});
