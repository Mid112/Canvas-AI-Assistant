import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import { paths } from "@/routes/paths";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

describe("ProtectedRoute", () => {
  function renderProtectedRoute(initialEntry = "/protected") {
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/protected" element={<div>Protected content</div>} />
          </Route>
          <Route path={paths.login} element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("shows loading state while auth is loading", () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    renderProtectedRoute();

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("redirects unauthenticated users to login", () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    renderProtectedRoute();

    expect(screen.getByText("Login page")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("renders child routes for authenticated users", () => {
    mockedUseAuth.mockReturnValue({
      user: {
        id: "1",
        email: "professor@university.edu",
        name: "professor",
        role: "instructor",
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    renderProtectedRoute();

    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
  });
});
