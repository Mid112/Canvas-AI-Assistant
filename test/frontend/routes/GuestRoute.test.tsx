import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { GuestRoute } from "@/routes/GuestRoute";
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

describe("GuestRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderGuestRoute(initialEntry = "/login") {
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<div>Login page</div>} />
          </Route>
          <Route
            path={paths.canvasInfo}
            element={<div>Canvas info</div>}
          />
          <Route
            path={paths.instructor.dashboard}
            element={<div>Instructor dashboard</div>}
          />
          <Route
            path={paths.admin.dashboard}
            element={<div>Admin dashboard</div>}
          />
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

    renderGuestRoute();

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders child routes for unauthenticated users", () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    renderGuestRoute();

    expect(screen.getByText("Login page")).toBeInTheDocument();
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

    renderGuestRoute();

    expect(screen.getByText("Canvas info")).toBeInTheDocument();
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
  });

  it("redirects authenticated users with completed onboarding to their dashboard", () => {
    mockedHasCompletedOnboarding.mockReturnValue(true);
    mockedUseAuth.mockReturnValue({
      user: instructorUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    renderGuestRoute();

    expect(screen.getByText("Instructor dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Canvas info")).not.toBeInTheDocument();
  });

  it("redirects admins to the admin dashboard without completed onboarding", () => {
    mockedHasCompletedOnboarding.mockReturnValue(false);
    mockedUseAuth.mockReturnValue({
      user: adminUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    renderGuestRoute();

    expect(screen.getByText("Admin dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Canvas info")).not.toBeInTheDocument();
  });
});
