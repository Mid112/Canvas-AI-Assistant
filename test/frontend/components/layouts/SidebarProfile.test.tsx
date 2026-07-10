import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SidebarProfile } from "@/components/layouts/SidebarProfile";
import { InstitutionProvider } from "@/contexts/InstitutionProvider";
import { paths } from "@/routes/paths";
import type { User } from "@/types/user";

const mockNavigate = vi.fn();
const mockLogout = vi.fn();

const baseUser: User = {
  id: 1,
  email: "jane.doe@ubc.ca",
  name: "Dr. Jane Doe",
  role: "instructor",
  is_active: true,
  has_canvas_token: false,
  canvas_connections: [],
};

const mockUseAuth = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

function renderSidebarProfile() {
  return render(
    <InstitutionProvider>
      <MemoryRouter>
        <SidebarProfile role="instructor" />
      </MemoryRouter>
    </InstitutionProvider>,
  );
}

describe("SidebarProfile", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mockUseAuth.mockReturnValue({
      logout: mockLogout,
      login: vi.fn(),
      register: vi.fn(),
      user: baseUser,
      isAuthenticated: true,
      isLoading: false,
    });
  });

  // Verifies: Renders the profile trigger with user details.
  it("renders the profile trigger with user details", () => {
    mockUseAuth.mockReturnValue({
      logout: mockLogout,
      login: vi.fn(),
      register: vi.fn(),
      user: baseUser,
      isAuthenticated: true,
      isLoading: false,
    });

    renderSidebarProfile();

    expect(
      screen.getByRole("button", { name: "Open profile menu" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Dr. Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Instructor")).toBeInTheDocument();
  });

  // Verifies: Hides the institution switcher when no Canvas connections exist.
  it("hides the institution switcher when no Canvas connections exist", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    mockUseAuth.mockReturnValue({
      logout: mockLogout,
      login: vi.fn(),
      register: vi.fn(),
      user: baseUser,
      isAuthenticated: true,
      isLoading: false,
    });

    renderSidebarProfile();

    await user.click(screen.getByRole("button", { name: "Open profile menu" }));

    expect(await screen.findByText("Profile settings")).toBeInTheDocument();
    expect(screen.getByText("Account settings")).toBeInTheDocument();
    expect(screen.queryByText("Switch institution")).not.toBeInTheDocument();
    expect(
      screen.queryByText("University of British Columbia"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("UBC Okanagan")).not.toBeInTheDocument();
    expect(screen.getByText("Log out")).toBeInTheDocument();
  });

  // Verifies: Shows the institution switcher only for connected institutions.
  it("shows the institution switcher only for connected institutions", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    vi.stubEnv("VITE_CANVAS_UBC_URL", "https://canvas.ubc.ca");
    vi.stubEnv("VITE_CANVAS_UBCO_URL", "https://canvas.ok.ubc.ca");

    mockUseAuth.mockReturnValue({
      logout: mockLogout,
      login: vi.fn(),
      register: vi.fn(),
      user: {
        ...baseUser,
        has_canvas_token: true,
        canvas_connections: [
          {
            id: 1,
            canvas_url: "https://canvas.ubc.ca",
            created_at: "2026-06-26T00:00:00.000Z",
          },
          {
            id: 2,
            canvas_url: "https://canvas.ok.ubc.ca",
            created_at: "2026-06-27T00:00:00.000Z",
          },
        ],
      },
      isAuthenticated: true,
      isLoading: false,
    });

    renderSidebarProfile();

    await user.click(screen.getByRole("button", { name: "Open profile menu" }));

    expect(await screen.findByText("Switch institution")).toBeInTheDocument();
    expect(
      screen.getByText("University of British Columbia"),
    ).toBeInTheDocument();
    expect(screen.getByText("UBC Okanagan")).toBeInTheDocument();
  });

  // Verifies: Logs out and navigates to login.
  it("logs out and navigates to login", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockNavigate.mockClear();
    mockLogout.mockClear();

    mockUseAuth.mockReturnValue({
      logout: mockLogout,
      login: vi.fn(),
      register: vi.fn(),
      user: baseUser,
      isAuthenticated: true,
      isLoading: false,
    });

    renderSidebarProfile();

    await user.click(screen.getByRole("button", { name: "Open profile menu" }));
    await user.click(await screen.findByText("Log out"));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(paths.login);
  });
});
