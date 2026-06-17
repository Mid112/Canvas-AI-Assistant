import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CanvasAuthErrorPage } from "@/pages/Error/CanvasAuthErrorPage";
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
    login: vi.fn(),
    register: vi.fn(),
    user: null,
    isAuthenticated: false,
    isLoading: false,
  }),
}));

describe("CanvasAuthErrorPage", () => {
  it("renders the canvas authentication error overview", () => {
    renderWithRouter(<CanvasAuthErrorPage />);

    expect(
      screen.getByRole("heading", { name: "Canvas Authentication Failed" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "We couldn't connect to your Canvas account. This could be due to:",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Invalid Canvas credentials or API token"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry Connection" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Contact Administrator" }),
    ).toHaveAttribute("href", "mailto:support@institution.edu");
    expect(
      screen.getByRole("button", { name: "Return to Login" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Need help? Contact your institution's IT support team"),
    ).toBeInTheDocument();
  });

  it("renders all failure reasons", () => {
    renderWithRouter(<CanvasAuthErrorPage />);

    expect(
      screen.getByText("Canvas server is temporarily unavailable"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Insufficient permissions on your Canvas account"),
    ).toBeInTheDocument();
    expect(screen.getByText("Network connectivity issues")).toBeInTheDocument();
  });

  it("navigates to canvas info on retry", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();

    renderWithRouter(<CanvasAuthErrorPage />);

    await user.click(screen.getByRole("button", { name: "Retry Connection" }));

    expect(mockNavigate).toHaveBeenCalledWith(paths.canvasInfo);
  });

  it("logs out and navigates to login on return", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();
    mockLogout.mockClear();

    renderWithRouter(<CanvasAuthErrorPage />);

    await user.click(screen.getByRole("button", { name: "Return to Login" }));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(paths.login);
  });
});
