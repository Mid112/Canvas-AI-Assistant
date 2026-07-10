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
    user: {
      id: 1,
      email: "jane.doe@ubc.ca",
      name: "Dr. Jane Doe",
      role: "instructor" as const,
      is_active: true,
      has_canvas_token: false,
      canvas_connections: [],
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

function getAccountMenuContainer() {
  return screen.getByRole("button", { name: "Account menu" }).parentElement;
}

describe("Header", () => {
  // Verifies: Hides the header account menu on desktop when the sidebar is open.
  it("hides the header account menu on desktop when the sidebar is open", () => {
    renderWithRouter(
      <Header
        title="Dashboard"
        role="instructor"
        roleLabel="Instructor"
        navItems={instructorNavItems}
        sidebarOpen
        onToggleSidebar={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
    expect(getAccountMenuContainer()).toHaveClass("lg:hidden");
  });

  // Verifies: Shows the account menu in the header when the sidebar is collapsed.
  it("shows the account menu in the header when the sidebar is collapsed", () => {
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

    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
    expect(getAccountMenuContainer()).not.toHaveClass("lg:hidden");
    expect(screen.queryByText("Dr. Jane Doe")).not.toBeInTheDocument();
    expect(screen.queryByText("Instructor")).not.toBeInTheDocument();
  });

  // Verifies: Shows the open sidebar button when the sidebar is closed.
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

  // Verifies: Logs out from the header account menu when the sidebar is collapsed.
  it("logs out from the header account menu when the sidebar is collapsed", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockNavigate.mockClear();
    mockLogout.mockClear();

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

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.queryByText("Instructor")).not.toBeInTheDocument();
    await user.click(await screen.findByText("Log out"));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(paths.login);
  });
});
