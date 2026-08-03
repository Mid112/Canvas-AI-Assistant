import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LayoutDashboard } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { Sidebar } from "@/components/layouts/Sidebar";
import { paths } from "@/routes/paths";
import type { NavItem } from "@/types/navigation";
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
      has_canvas_token: false,
      canvas_connections: [],
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock("@/contexts/useInstitution", () => ({
  useInstitution: () => ({
    institutions: [],
    selectedInstitution: {
      id: "ubc",
      name: "University of British Columbia",
      shortName: "UBC",
    },
    setSelectedInstitution: vi.fn(),
    courses: [],
    analytics: {},
    dashboard: {},
  }),
}));

// Sidebar mounts ActiveCourseSidebarBadge for the instructor role, which
// reads from ActiveCourseProvider — mock it the same way as the other
// contexts above rather than wrapping every render in the real provider.
vi.mock("@/contexts/useActiveCourse", () => ({
  useActiveCourse: () => ({
    activeCourse: { localId: 1, displayName: "CPSC 101: Intro to Programming" },
    availableCourses: [],
    isLoading: false,
    isSaving: false,
    error: null,
    selectActiveCourse: vi.fn(),
    refreshActiveCourse: vi.fn(),
  }),
}));

function renderSidebar(props: ComponentProps<typeof Sidebar>) {
  return render(
    <MemoryRouter>
      <Sidebar {...props} />
    </MemoryRouter>,
  );
}

describe("Sidebar", () => {
  // Verifies: Renders navigation items, portal branding, and account menu footer.
  it("renders navigation items, portal branding, and account menu footer", () => {
    renderSidebar({
      navItems: instructorNavItems,
      role: "instructor",
      roleLabel: "Instructor",
    });

    expect(screen.getAllByText("Canvas AI").length).toBeGreaterThan(0);
    expect(screen.getByText("Instructor Portal")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Account menu" })).toBeInTheDocument();
    expect(screen.getByText("Dr. Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Instructor")).toBeInTheDocument();
  });

  // Verifies: Keeps the instructor role on the profile trigger.
  it("keeps the instructor role on the profile trigger", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    renderSidebar({
      navItems: instructorNavItems,
      role: "instructor",
      roleLabel: "Instructor",
    });

    await user.click(screen.getByRole("button", { name: "Account menu" }));

    expect(screen.getAllByText("Instructor").length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText("Connect institution")).toBeInTheDocument();
  });

  // Verifies: Highlights the active navigation item.
  it("highlights the active navigation item", () => {
    render(
      <MemoryRouter initialEntries={["/instructor/dashboard"]}>
        <Sidebar
          navItems={instructorNavItems}
          role="instructor"
          roleLabel="Instructor"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveClass(
      "bg-sidebar-primary",
    );
  });

  // Verifies: Calls onToggle when the close sidebar button is clicked.
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

  // Verifies: Logs out from the account menu footer.
  it("logs out from the account menu footer", async () => {
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

    await user.click(screen.getByRole("button", { name: "Account menu" }));
    await user.click(await screen.findByText("Log out"));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(paths.login);
  });

  // Feature 9 Phase 2: nav item health badge dot.
  const dashboardItem: NavItem = {
    title: "Dashboard",
    href: instructorNavItems[0].href,
    icon: LayoutDashboard,
  };

  it("renders no badge dot for an item with no badge set", () => {
    renderSidebar({ navItems: [dashboardItem], role: "instructor", roleLabel: "Instructor" });

    expect(screen.queryByLabelText(/status:/)).not.toBeInTheDocument();
  });

  it("renders no badge dot for a healthy item", () => {
    renderSidebar({
      navItems: [{ ...dashboardItem, badge: "healthy" }],
      role: "instructor",
      roleLabel: "Instructor",
    });

    expect(screen.queryByLabelText(/status:/)).not.toBeInTheDocument();
  });

  it("renders a badge dot for a degraded item", () => {
    renderSidebar({
      navItems: [{ ...dashboardItem, badge: "degraded" }],
      role: "instructor",
      roleLabel: "Instructor",
    });

    expect(screen.getByLabelText("Dashboard status: degraded")).toBeInTheDocument();
  });

  it("renders a badge dot for a down item", () => {
    renderSidebar({
      navItems: [{ ...dashboardItem, badge: "down" }],
      role: "instructor",
      roleLabel: "Instructor",
    });

    expect(screen.getByLabelText("Dashboard status: down")).toBeInTheDocument();
  });
});
