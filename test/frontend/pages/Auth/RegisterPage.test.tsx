import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { RegisterPage } from "@/pages/Auth/RegisterPage";
import { paths } from "@/routes/paths";
import { AuthApiError } from "@/services/auth";
import { getPostAuthPath } from "@/utils/onboarding";
import { renderWithRouter } from "../../utils/renderWithRouter";

const mockNavigate = vi.fn();
const mockRegister = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    login: vi.fn(),
    logout: vi.fn(),
    register: mockRegister,
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

describe("RegisterPage", () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockRegister.mockReset();
  });

  it("renders all register sections", () => {
    renderWithRouter(<RegisterPage />);

    expect(
      screen.getByText("Canvas Workflow Assistant"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Create Account" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("First Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Last Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm Password")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to home" }),
    ).toBeInTheDocument();
  });

  it("navigates to canvas info on create account", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();
    mockRegister.mockResolvedValue({
      id: 1,
      email: "professor@university.edu",
      name: "professor",
      role: "instructor",
      is_active: true,
      has_canvas_token: false,
      canvas_connections: [],
    });

    renderWithRouter(<RegisterPage />);

    await user.type(screen.getByLabelText("First Name"), "Jane");
    await user.type(screen.getByLabelText("Last Name"), "Smith");
    await user.type(
      screen.getByLabelText("Email Address"),
      "professor@university.edu",
    );
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.type(screen.getByLabelText("Confirm Password"), "secret123");
    await user.click(
      screen.getByLabelText(
        "I agree to the Terms of Service and Privacy Policy",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Create Account" }));

    expect(mockRegister).toHaveBeenCalledWith({
      name: "Jane Smith",
      email: "professor@university.edu",
      password: "secret123",
    });
    expect(mockNavigate).toHaveBeenCalledWith(
      getPostAuthPath({
        id: 1,
        role: "instructor",
        canvas_connections: [],
      }),
    );
    expect(
      getPostAuthPath({
        id: 1,
        role: "instructor",
        canvas_connections: [],
      }),
    ).toBe(paths.canvasInfo);
  });

  it("shows an error when registration fails with a duplicate email", async () => {
    const user = userEvent.setup();
    mockRegister.mockRejectedValue(
      new AuthApiError("Email already registered", 400),
    );

    renderWithRouter(<RegisterPage />);

    await user.type(screen.getByLabelText("First Name"), "Jane");
    await user.type(screen.getByLabelText("Last Name"), "Smith");
    await user.type(
      screen.getByLabelText("Email Address"),
      "professor@university.edu",
    );
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.type(screen.getByLabelText("Confirm Password"), "secret123");
    await user.click(
      screen.getByLabelText(
        "I agree to the Terms of Service and Privacy Policy",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Create Account" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "An account with this email already exists.",
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
