import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Sidebar } from "@/components/layouts/Sidebar";
import { paths } from "@/routes/paths";
import { instructorNavItems } from "@/utils/navigation";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const mockNavigate = vi.fn();
const mockLogout = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    logout: mockLogout,
    login: vi.fn(),
    register: vi.fn(),
    user: null,
    isAuthenticated: true,
    isLoading: false,
  }),
}));

describe("Sidebar", () => {
  it("renders navigation items and role label", () => {
    renderWithRouter(
      <Sidebar navItems={instructorNavItems} roleLabel="Instructor" />,
    );

    expect(screen.getByText("Canvas Workflow")).toBeInTheDocument();
    expect(screen.getByText("Instructor")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("logs out and navigates to login when log out is clicked", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    mockNavigate.mockClear();
    mockLogout.mockClear();

    renderWithRouter(
      <Sidebar
        navItems={instructorNavItems}
        roleLabel="Instructor"
        onNavigate={onNavigate}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(paths.login);
  });
});
