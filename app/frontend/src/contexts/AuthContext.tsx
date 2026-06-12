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
import type { LoginCredentials, RegisterCredentials } from "@/types/auth";
import type { User, UserRole } from "@/types/user";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (credentials: RegisterCredentials) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT_ROLE: UserRole = "instructor";

function mapUserResponse(response: {
  id: number;
  email: string;
}): User {
  return {
    id: String(response.id),
    email: response.email,
    name: response.email.split("@")[0] ?? response.email,
    role: DEFAULT_ROLE,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async (token: string) => {
    const currentUser = await fetchCurrentUser(token);
    setUser(mapUserResponse(currentUser));
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
    await loadUser(tokenResponse.access_token);
  }, [loadUser]);

  const register = useCallback(async (credentials: RegisterCredentials) => {
    const tokenResponse = await registerUser(credentials);
    setStoredToken(tokenResponse.access_token);
    await loadUser(tokenResponse.access_token);
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
