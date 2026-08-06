// Test note: covers the protected route.test behavior so future changes can preserve the expected Canvas workflow contract.

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/routes/ProtectedRoute";
import { paths } from "@/routes/paths";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/utils/onboarding", async () => {
  const actual = await vi.importActual("@/utils/onboarding");
  return {
    ...actual,
    isOnboardingComplete: vi.fn(),
  };
});

import { isOnboardingComplete } from "@/utils/onboarding";

const mockedUseAuth = vi.mocked(useAuth);
const mockedIsOnboardingComplete = vi.mocked(isOnboardingComplete);

const instructorUser = {
  id: 1,
  email: "professor@university.edu",
  name: "professor",
  role: "instructor" as const,
  is_active: true,
  has_canvas_token: false,
  canvas_connections: [],
};

const adminUser = {
  id: 2,
  email: "admin@university.edu",
  name: "admin",
  role: "admin" as const,
  is_active: true,
  has_canvas_token: false,
  canvas_connections: [],
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
            <Route
              path={paths.instructor.assistant}
              element={<div>Assistant page</div>}
            />
          </Route>
          <Route path={paths.login} element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  // Verifies: Shows loading state while auth is loading.
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

  // Verifies: Redirects unauthenticated users to login.
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

  // Verifies: Renders child routes for authenticated users who completed onboarding.
  it("renders child routes for authenticated users who completed onboarding", () => {
    mockedIsOnboardingComplete.mockReturnValue(true);
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

  // Verifies: Redirects authenticated users without completed onboarding to canvas info.
  it("redirects authenticated users without completed onboarding to canvas info", () => {
    mockedIsOnboardingComplete.mockReturnValue(false);
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

  // Verifies: Redirects instructor app routes to onboarding before completion.
  it("redirects instructor app routes to onboarding before completion", () => {
    mockedIsOnboardingComplete.mockReturnValue(false);
    mockedUseAuth.mockReturnValue({
      user: instructorUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={[paths.instructor.assistant]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route
              path={paths.instructor.assistant}
              element={<div>Assistant page</div>}
            />
            <Route path={paths.canvasInfo} element={<div>Canvas info</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Canvas info")).toBeInTheDocument();
    expect(screen.queryByText("Assistant page")).not.toBeInTheDocument();
  });

  // Verifies: Allows onboarding routes before onboarding is complete.
  it("allows onboarding routes before onboarding is complete", () => {
    mockedIsOnboardingComplete.mockReturnValue(false);
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

  // Verifies: Allows admins to access protected routes without completed onboarding.
  it("allows admins to access protected routes without completed onboarding", () => {
    mockedIsOnboardingComplete.mockReturnValue(false);
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
