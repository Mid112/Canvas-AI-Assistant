import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AccountMenu } from "@/components/layouts/AccountMenu";
import { paths } from "@/routes/paths";
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
    user: {
      id: 1,
      email: "professor@university.edu",
      name: "Dr. Jane Doe",
      role: "instructor",
      is_active: true,
      has_canvas_token: false,
      canvas_connections: [],
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

describe("AccountMenu", () => {
  // Verifies: Renders the profile trigger with name and role label.
  it("renders the profile trigger with name and role label", () => {
    renderWithRouter(
      <AccountMenu role="instructor" roleLabel="Instructor" trigger="profile" />,
    );

    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
    expect(screen.getByText("Dr. Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Instructor")).toBeInTheDocument();
  });

  // Verifies: Renders the icon trigger without profile details.
  it("renders the icon trigger without profile details", () => {
    renderWithRouter(<AccountMenu role="instructor" trigger="icon" />);

    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
    expect(screen.queryByText("Dr. Jane Doe")).not.toBeInTheDocument();
  });

  // Verifies: Opens the menu without a redundant role label in the dropdown.
  it("opens the menu without a redundant role label in the dropdown", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    renderWithRouter(
      <AccountMenu role="instructor" roleLabel="Instructor" trigger="profile" />,
    );

    await user.click(screen.getByRole("button", { name: "Account menu" }));

    expect(await screen.findByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Log out")).toBeInTheDocument();
    expect(screen.queryAllByText("Instructor")).toHaveLength(1);
  });

  // Verifies: Navigates to profile from the account menu.
  it("navigates to profile from the account menu", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockNavigate.mockClear();

    renderWithRouter(
      <AccountMenu role="instructor" trigger="icon" />,
    );

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(await screen.findByText("Profile"));

    expect(mockNavigate).toHaveBeenCalledWith(paths.instructor.profile);
  });

  // Verifies: Renders the profile trigger without a role label.
  it("renders the profile trigger without a role label", () => {
    renderWithRouter(
      <AccountMenu role="instructor" trigger="profile" />,
    );

    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
    expect(screen.getByText("Dr. Jane Doe")).toBeInTheDocument();
    expect(screen.queryByText("Instructor")).not.toBeInTheDocument();
  });

  // Verifies: Navigates to home from the account menu.
  it("navigates to home from the account menu", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockNavigate.mockClear();

    renderWithRouter(<AccountMenu role="instructor" trigger="icon" />);

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(await screen.findByText("Home"));

    expect(mockNavigate).toHaveBeenCalledWith(paths.home);
  });

  // Verifies: Logs out and navigates to login.
  it("logs out and navigates to login", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onNavigate = vi.fn();
    mockNavigate.mockClear();
    mockLogout.mockClear();

    renderWithRouter(
      <AccountMenu role="instructor" trigger="icon" onNavigate={onNavigate} />,
    );

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(await screen.findByText("Log out"));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(paths.login);
  });
});
