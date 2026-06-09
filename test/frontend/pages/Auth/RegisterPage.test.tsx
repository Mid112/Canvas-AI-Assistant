import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RegisterPage } from "@/pages/Auth/RegisterPage";
import { paths } from "@/routes/paths";
import { renderWithRouter } from "../../utils/renderWithRouter";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe("RegisterPage", () => {
  it("renders all register sections", () => {
    renderWithRouter(<RegisterPage />);

    expect(
      screen.getByText("Canvas Workflow Assistant"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Create Account" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Full Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm Password")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to home" }),
    ).toBeInTheDocument();
  });

  it("navigates to login on create account", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();

    renderWithRouter(<RegisterPage />);

    await user.type(screen.getByLabelText("Full Name"), "Dr. Jane Smith");
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

    expect(mockNavigate).toHaveBeenCalledWith(paths.login);
  });
});
