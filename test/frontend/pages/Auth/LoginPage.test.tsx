import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { LoginPage } from "@/pages/Auth/LoginPage";
import { paths } from "@/routes/paths";
import { AuthApiError } from "@/services/auth";
import { renderWithRouter } from "@test/utils/renderWithRouter";

const mockNavigate = vi.fn();
const mockLogin = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    login: mockLogin,
    logout: vi.fn(),
    register: vi.fn(),
    user: null,
    isAuthenticated: false,
    isLoading: false,
  }),
  AuthApiError: class AuthApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

describe("LoginPage", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockLogin.mockReset();
  });

  // Verifies: Renders all login sections.
  it("renders all login sections", () => {
    renderWithRouter(<LoginPage />);

    expect(
      screen.getByText("Canvas Workflow Assistant"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign up" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to home" }),
    ).toBeInTheDocument();
  });

  // Verifies: Navigates to onboarding after successful sign in.
  it("navigates to onboarding after successful sign in", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();
    mockLogin.mockResolvedValue({
      id: 1,
      email: "professor@university.edu",
      name: "professor",
      role: "instructor",
      is_active: true,
      has_canvas_token: false,
      canvas_connections: [],
    });

    renderWithRouter(<LoginPage />);

    await user.type(
      screen.getByLabelText("Email Address"),
      "professor@university.edu",
    );
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(mockLogin).toHaveBeenCalledWith({
      email: "professor@university.edu",
      password: "secret123",
    });
    expect(mockNavigate).toHaveBeenCalledWith(paths.canvasInfo);
  });

  // Verifies: Navigates to the admin dashboard after successful admin sign in.
  it("navigates to the admin dashboard after successful admin sign in", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();
    mockLogin.mockResolvedValue({
      id: 2,
      email: "admin@university.edu",
      name: "admin",
      role: "admin",
      is_active: true,
      has_canvas_token: false,
      canvas_connections: [],
    });

    renderWithRouter(<LoginPage />);

    await user.type(
      screen.getByLabelText("Email Address"),
      "admin@university.edu",
    );
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(mockNavigate).toHaveBeenCalledWith(paths.admin.dashboard);
  });

  // Verifies: Shows an error when sign in fails with invalid credentials.
  it("shows an error when sign in fails with invalid credentials", async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValue(
      new AuthApiError("Invalid credentials", 401),
    );

    renderWithRouter(<LoginPage />);

    await user.type(
      screen.getByLabelText("Email Address"),
      "professor@university.edu",
    );
    await user.type(screen.getByLabelText("Password"), "wrongpassword");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Invalid email or password.",
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
