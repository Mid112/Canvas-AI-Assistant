import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { SidebarProfile } from "@/components/layouts/SidebarProfile";
import { InstitutionProvider } from "@/contexts/InstitutionContext";
import { paths } from "@/routes/paths";

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
      has_canvas_token: true,
    },
    isAuthenticated: true,
    isLoading: false,
  }),
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
  it("renders the profile trigger with user details", () => {
    renderSidebarProfile();

    expect(
      screen.getByRole("button", { name: "Open profile menu" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Dr. Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Instructor")).toBeInTheDocument();
  });

  it("shows profile, settings, institution switcher, and log out actions", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    renderSidebarProfile();

    await user.click(screen.getByRole("button", { name: "Open profile menu" }));

    expect(await screen.findByText("Profile settings")).toBeInTheDocument();
    expect(screen.getByText("Account settings")).toBeInTheDocument();
    expect(screen.getByText("Switch institution")).toBeInTheDocument();
    expect(
      screen.getByText("University of British Columbia"),
    ).toBeInTheDocument();
    expect(screen.getByText("UBC Okanagan")).toBeInTheDocument();
    expect(screen.getByText("Log out")).toBeInTheDocument();
  });

  it("logs out and navigates to login", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    mockNavigate.mockClear();
    mockLogout.mockClear();

    renderSidebarProfile();

    await user.click(screen.getByRole("button", { name: "Open profile menu" }));
    await user.click(await screen.findByText("Log out"));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(paths.login);
  });
});
