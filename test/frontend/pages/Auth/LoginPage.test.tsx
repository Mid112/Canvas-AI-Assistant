import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LoginPage } from "@/pages/Auth/LoginPage";
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

describe("LoginPage", () => {
  it("renders all login sections", () => {
    renderWithRouter(<LoginPage />);

    expect(
      screen.getByText("Canvas Workflow Assistant"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Welcome Back" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign up" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to home" }),
    ).toBeInTheDocument();
  });

  it("navigates to instructor dashboard on sign in", async () => {
    const user = userEvent.setup();
    mockNavigate.mockClear();

    renderWithRouter(<LoginPage />);

    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(mockNavigate).toHaveBeenCalledWith(paths.instructor.dashboard);
  });
});
