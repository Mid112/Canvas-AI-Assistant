import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  loginUser,
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
  logout: () => void;
  refreshUser: () => Promise<User>;
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

  const logout = useCallback(() => {
    clearStoredToken();
    setAccessToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const token = accessToken ?? getStoredToken();
    if (!token) {
      throw new Error("Not authenticated");
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

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      isAuthenticated: user !== null,
      isLoading,
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, accessToken, isLoading, login, register, logout, refreshUser],
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
