import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { Sidebar } from "@/components/layouts/Sidebar";
import { InstitutionProvider } from "@/contexts/InstitutionContext";
import { paths } from "@/routes/paths";
import { instructorNavItems } from "@/utils/navigation";

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

function renderSidebar(props: ComponentProps<typeof Sidebar>) {
  return render(
    <InstitutionProvider>
      <MemoryRouter>
        <Sidebar {...props} />
      </MemoryRouter>
    </InstitutionProvider>,
  );
}

describe("Sidebar", () => {
  it("renders navigation items and portal branding", () => {
    renderSidebar({
      navItems: instructorNavItems,
      role: "instructor",
      roleLabel: "Instructor",
    });

    expect(screen.getByText("Canvas AI")).toBeInTheDocument();
    expect(screen.getByText("Instructor Portal")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open profile menu" })).toBeInTheDocument();
  });

  it("calls onToggle when the close sidebar button is clicked", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onToggle = vi.fn();

    renderSidebar({
      navItems: instructorNavItems,
      role: "instructor",
      roleLabel: "Instructor",
      showToggle: true,
      onToggle,
    });

    await user.click(screen.getByRole("button", { name: "Close sidebar" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("logs out from the profile menu", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onNavigate = vi.fn();
    mockNavigate.mockClear();
    mockLogout.mockClear();

    renderSidebar({
      navItems: instructorNavItems,
      role: "instructor",
      roleLabel: "Instructor",
      onNavigate,
    });

    await user.click(screen.getByRole("button", { name: "Open profile menu" }));
    await user.click(await screen.findByText("Log out"));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(paths.login);
  });
});
