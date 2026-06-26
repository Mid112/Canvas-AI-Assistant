import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Header } from "@/components/layouts/Header";
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

describe("Header", () => {
  it("renders the page title and account menu", () => {
    renderWithRouter(
      <Header
        title="Dashboard"
        role="instructor"
        roleLabel="Instructor"
        navItems={instructorNavItems}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
  });

  it("shows the open sidebar button when the sidebar is closed", () => {
    renderWithRouter(
      <Header
        title="Dashboard"
        role="instructor"
        roleLabel="Instructor"
        navItems={instructorNavItems}
        sidebarOpen={false}
        onToggleSidebar={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Open sidebar" }),
    ).toBeInTheDocument();
  });

  it("logs out and navigates to login from the account menu", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockNavigate.mockClear();
    mockLogout.mockClear();

    renderWithRouter(
      <Header
        title="Dashboard"
        role="instructor"
        roleLabel="Instructor"
        navItems={instructorNavItems}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(await screen.findByText("Log out"));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(paths.login);
  });
});
