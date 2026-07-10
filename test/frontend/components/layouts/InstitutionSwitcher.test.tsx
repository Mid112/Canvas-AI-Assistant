import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InstitutionSwitcher } from "@/components/layouts/InstitutionSwitcher";
import { InstitutionProvider } from "@/contexts/InstitutionProvider";

const mockUseAuth = vi.fn();
const mockNavigate = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderSwitcher() {
  return render(
    <MemoryRouter>
      <InstitutionProvider>
        <InstitutionSwitcher />
      </InstitutionProvider>
    </MemoryRouter>,
  );
}

describe("InstitutionSwitcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_CANVAS_UBC_URL", "https://canvas.ubc.ca");
    vi.stubEnv("VITE_CANVAS_UBCO_URL", "https://canvas.ok.ubc.ca");
  });

  it("prompts to connect when there are no institutions", () => {
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

    renderSwitcher();

    await user.click(screen.getByRole("button", { name: "Switch institution" }));
    expect(await screen.findByText("Institutions")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /UBCO/i })).toBeInTheDocument();

    await user.click(screen.getByRole("menuitem", { name: /UBCO/i }));
    expect(screen.getByRole("button", { name: "Switch institution" })).toHaveTextContent(
      "UBCO",
    );
  });
});
