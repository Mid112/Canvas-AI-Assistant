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
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<User>;
  register: (credentials: RegisterCredentials) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT_ROLE: UserRole = "instructor";

function mapUserResponse(response: UserResponse & { role?: string }): User {
  const role = (response.role as UserRole | undefined) ?? DEFAULT_ROLE;

  return {
    id: response.id,
    email: response.email,
    name: response.name ?? response.email.split("@")[0] ?? response.email,
    role,
    is_active: response.is_active,
    has_canvas_token: response.has_canvas_token,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async (token: string) => {
    const currentUser = await fetchCurrentUser(token);
    const mappedUser = mapUserResponse(currentUser);
    setUser(mappedUser);
    return mappedUser;
  }, []);

  useEffect(() => {
    const token = getStoredToken();

    if (!token) {
      setIsLoading(false);
      return;
    }

    loadUser(token)
      .catch(() => {
        clearStoredToken();
        setUser(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [loadUser]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    const tokenResponse = await loginUser(credentials);
    setStoredToken(tokenResponse.access_token);

    try {
      return await loadUser(tokenResponse.access_token);
    } catch (error) {
      clearStoredToken();
      setUser(null);
      throw error;
    }
  }, [loadUser]);

  const register = useCallback(async (credentials: RegisterCredentials) => {
    const tokenResponse = await registerUser(credentials);
    setStoredToken(tokenResponse.access_token);

    try {
      return await loadUser(tokenResponse.access_token);
    } catch (error) {
      clearStoredToken();
      setUser(null);
      throw error;
    }
  }, [loadUser]);

  const logout = useCallback(() => {
    clearStoredToken();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      register,
      logout,
    }),
    [user, isLoading, login, register, logout],
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
