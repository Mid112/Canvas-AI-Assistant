import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  clearStoredToken,
  getStoredToken,
  setStoredToken,
} from "@/lib/auth-storage";
import {
  AuthApiError,
  fetchCurrentUser,
  LOGOUT_REVOKE_TIMEOUT_MS,
  loginUser,
  logoutUser,
  registerUser,
} from "@/services/auth";
import type {
  LoginCredentials,
  RegisterCredentials,
  UserResponse,
} from "@/types/auth";
import type { User, UserRole } from "@/types/user";

interface AuthContextValue {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<User>;
  register: (credentials: RegisterCredentials) => Promise<User>;
  refreshUser: () => Promise<User | null>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isUserRole(role: string): role is UserRole {
  return role === "instructor" || role === "admin";
}

export class UnsupportedUserRoleError extends Error {
  constructor(role: string) {
    super(`Unsupported user role: ${role}`);
    this.name = "UnsupportedUserRoleError";
  }
}

function mapUserResponse(response: UserResponse): User {
  if (!isUserRole(response.role)) {
    throw new UnsupportedUserRoleError(response.role);
  }

  return {
    id: response.id,
    email: response.email,
    name: response.name ?? response.email.split("@")[0] ?? response.email,
    role: response.role,
    is_active: response.is_active,
    has_canvas_token: response.has_canvas_token,
    canvas_connections: response.canvas_connections ?? [],
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    getStoredToken(),
  );
  const [isLoading, setIsLoading] = useState(() => getStoredToken() !== null);
  // Keep logout referentially stable across token refreshes (review nit):
  // read the latest token from a ref instead of closing over accessToken.
  const accessTokenRef = useRef(accessToken);
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  const loadUser = useCallback(async (token: string) => {
    const currentUser = await fetchCurrentUser(token);
    const mappedUser = mapUserResponse(currentUser);
    setUser(mappedUser);
    return mappedUser;
  }, []);

  useEffect(() => {
    const token = getStoredToken();

    if (!token) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        await loadUser(token);
      } catch {
        if (cancelled) {
          return;
        }

        clearStoredToken();
        setAccessToken(null);
        setUser(null);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadUser]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const tokenResponse = await loginUser(credentials);
    setStoredToken(tokenResponse.access_token);
    setAccessToken(tokenResponse.access_token);

    try {
      return await loadUser(tokenResponse.access_token);
    } catch (error) {
      clearStoredToken();
      setAccessToken(null);
      setUser(null);
      throw error;
    }
  }, [loadUser]);

  const register = useCallback(async (credentials: RegisterCredentials) => {
    const tokenResponse = await registerUser(credentials);
    setStoredToken(tokenResponse.access_token);
    setAccessToken(tokenResponse.access_token);

    try {
      return await loadUser(tokenResponse.access_token);
    } catch (error) {
      clearStoredToken();
      setAccessToken(null);
      setUser(null);
      throw error;
    }
  }, [loadUser]);

  const refreshUser = useCallback(async () => {
    const token = accessToken ?? getStoredToken();
    if (!token) {
      return null;
    }

    try {
      return await loadUser(token);
    } catch (error) {
      clearStoredToken();
      setAccessToken(null);
      setUser(null);
      throw error;
    }
  }, [accessToken, loadUser]);

  const logout = useCallback(async () => {
    const token = accessTokenRef.current ?? getStoredToken();
    if (token) {
      try {
        await Promise.race([
          logoutUser(token),
          new Promise<void>((resolve) => {
            setTimeout(resolve, LOGOUT_REVOKE_TIMEOUT_MS);
          }),
        ]);
      } catch {
        // Revoke failed or timed out — still sign out locally below.
      }
    }
    clearStoredToken();
    setAccessToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isAuthenticated: user !== null,
      isLoading,
      login,
      register,
      refreshUser,
      logout,
    }),
    [user, accessToken, isLoading, login, register, refreshUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}

export { AuthApiError };
