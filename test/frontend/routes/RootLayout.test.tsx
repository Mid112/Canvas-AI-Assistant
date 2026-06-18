import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { getStoredToken } from "@/lib/auth-storage";
import { RootLayout } from "@/routes/RootLayout";

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

function AuthConsumer() {
  const { isLoading, isAuthenticated } = useAuth();

  return (
    <div>
      <span data-testid="auth-status">{isLoading ? "loading" : "ready"}</span>
      <span data-testid="auth-role">
        {isAuthenticated ? "authenticated" : "guest"}
      </span>
    </div>
  );
}

describe("RootLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetStoredToken.mockReturnValue(null);
  });

  it("provides auth context to nested routes", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<RootLayout />}>
            <Route path="/" element={<AuthConsumer />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("auth-status")).toHaveTextContent("ready");
    expect(screen.getByTestId("auth-role")).toHaveTextContent("guest");
  });
});
