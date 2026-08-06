// Test note: covers the institution switcher.test behavior so future changes can preserve the expected Canvas workflow contract.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InstitutionSwitcher } from "@/components/layouts/InstitutionSwitcher";
import type { Institution } from "@/types/institution";

const mockUseAuth = vi.fn();
const mockNavigate = vi.fn();
const mockSetSelectedInstitution = vi.fn();
const mockUseInstitution = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/contexts/useInstitution", () => ({
  useInstitution: () => mockUseInstitution(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const connectedInstitutions: Institution[] = [
  {
    id: "ubc",
    name: "University of British Columbia",
    shortName: "UBC",
    canvasUrl: "https://canvas.ubc.ca",
  },
  {
    id: "ubco",
    name: "UBC Okanagan",
    shortName: "UBCO",
    canvasUrl: "https://canvas.ok.ubc.ca",
  },
];

function renderSwitcher() {
  return render(
    <MemoryRouter>
      <InstitutionSwitcher />
    </MemoryRouter>,
  );
}

describe("InstitutionSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_CANVAS_UBC_URL", "https://canvas.ubc.ca");
    vi.stubEnv("VITE_CANVAS_UBCO_URL", "https://canvas.ok.ubc.ca");
    mockUseInstitution.mockReturnValue({
      institutions: [],
      selectedInstitution: {
        id: "ubc",
        name: "University of British Columbia",
        shortName: "UBC",
      },
      setSelectedInstitution: mockSetSelectedInstitution,
      courses: [],
      analytics: {},
      dashboard: {},
    });
  });

  it("prompts to connect when there are no institutions", () => {
    // Covers the empty connection state: instructors without a Canvas
    // institution should see the settings/connect call to action.
    mockUseAuth.mockReturnValue({
      accessToken: "token",
      user: {
        id: 1,
        email: "jane@example.com",
        name: "Jane",
        role: "instructor",
        is_active: true,
        has_canvas_token: false,
        canvas_connections: [],
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    renderSwitcher();

    expect(
      screen.getByRole("button", { name: "Connect institution" }),
    ).toBeInTheDocument();
  });

  it("lists connected institutions and allows switching", async () => {
    // Covers the connected state: the dropdown lists each institution and calls
    // the context setter with the selected institution id.
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({
      accessToken: "token",
      user: {
        id: 1,
        email: "jane@example.com",
        name: "Jane",
        role: "instructor",
        is_active: true,
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
            created_at: "2026-06-26T00:00:00.000Z",
          },
        ],
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    // Mock the hook directly so this unit test does not start the provider's
    // async dashboard fetch while still proving the switcher delegates updates.
    mockUseInstitution.mockReturnValue({
      institutions: connectedInstitutions,
      selectedInstitution: connectedInstitutions[0],
      setSelectedInstitution: mockSetSelectedInstitution,
      courses: [],
      analytics: {},
      dashboard: {},
    });

    renderSwitcher();

    await user.click(screen.getByRole("button", { name: "Switch institution" }));
    expect(await screen.findByText("Institutions")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /UBCO/i })).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: /UBCO/i }));
    expect(mockSetSelectedInstitution).toHaveBeenCalledWith("ubco");
  });
});
