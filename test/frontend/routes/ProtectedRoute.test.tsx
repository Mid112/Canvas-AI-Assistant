import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import { paths } from "@/routes/paths";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/lib/onboarding-storage", () => ({
  hasCompletedOnboarding: vi.fn(),
}));

import { hasCompletedOnboarding } from "@/lib/onboarding-storage";

const mockedUseAuth = vi.mocked(useAuth);
const mockedHasCompletedOnboarding = vi.mocked(hasCompletedOnboarding);

const instructorUser = {
  id: 1,
  email: "professor@university.edu",
  name: "professor",
  role: "instructor" as const,
  is_active: true,
  has_canvas_token: false,
};

const adminUser = {
  id: 2,
  email: "admin@university.edu",
  name: "admin",
  role: "admin" as const,
  is_active: true,
  has_canvas_token: false,
};

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderProtectedRoute(initialEntry = "/protected") {
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/protected" element={<div>Protected content</div>} />
            <Route path={paths.canvasInfo} element={<div>Canvas info</div>} />
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

  it("renders child routes for authenticated users who completed onboarding", () => {
    mockedHasCompletedOnboarding.mockReturnValue(true);
    mockedUseAuth.mockReturnValue({
      user: instructorUser,
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

  it("redirects authenticated users without completed onboarding to canvas info", () => {
    mockedHasCompletedOnboarding.mockReturnValue(false);
    mockedUseAuth.mockReturnValue({
      user: instructorUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    renderProtectedRoute();

    expect(screen.getByText("Canvas info")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("allows onboarding routes before onboarding is complete", () => {
    mockedHasCompletedOnboarding.mockReturnValue(false);
    mockedUseAuth.mockReturnValue({
      user: instructorUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={[paths.canvasInfo]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path={paths.canvasInfo} element={<div>Canvas info</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Canvas info")).toBeInTheDocument();
  });

  it("allows admins to access protected routes without completed onboarding", () => {
    mockedHasCompletedOnboarding.mockReturnValue(false);
    mockedUseAuth.mockReturnValue({
      user: adminUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    renderProtectedRoute();

    expect(screen.getByText("Protected content")).toBeInTheDocument();
    expect(screen.queryByText("Canvas info")).not.toBeInTheDocument();
  });
});
