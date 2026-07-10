import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";
import { RoleRoute } from "@/routes/RoleRoute";
import { paths } from "@/routes/paths";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const mockedUseAuth = vi.mocked(useAuth);

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

describe("RoleRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderRoleRoute(
    role: "instructor" | "admin",
    initialEntry: string,
  ) {
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route element={<RoleRoute role={role} />}>
            <Route path={initialEntry} element={<div>Protected role content</div>} />
          </Route>
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

  // Verifies: Renders child routes when the user role matches.
  it("renders child routes when the user role matches", () => {
    mockedUseAuth.mockReturnValue({
      user: adminUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    renderRoleRoute("admin", paths.admin.dashboard);

    expect(screen.getByText("Protected role content")).toBeInTheDocument();
  });

  // Verifies: Redirects users to their own dashboard when the role does not match.
  it("redirects users to their own dashboard when the role does not match", () => {
    mockedUseAuth.mockReturnValue({
      user: instructorUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    renderRoleRoute("admin", paths.admin.dashboard);

    expect(screen.getByText("Instructor dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Protected role content")).not.toBeInTheDocument();
  });

  // Verifies: Blocks instructors from admin audit logs route.
  it("blocks instructors from admin audit logs route", () => {
    mockedUseAuth.mockReturnValue({
      user: instructorUser,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    renderRoleRoute("admin", paths.admin.audit);

    expect(screen.getByText("Instructor dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Protected role content")).not.toBeInTheDocument();
  });
});
