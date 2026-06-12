import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { GuestRoute } from "@/routes/GuestRoute";
import { paths } from "@/routes/paths";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

describe("GuestRoute", () => {
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

  it("redirects authenticated users to canvas info onboarding", () => {
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

    renderGuestRoute();

    expect(screen.getByText("Canvas info")).toBeInTheDocument();
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
  });
});
