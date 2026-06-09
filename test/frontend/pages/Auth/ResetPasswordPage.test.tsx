import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ResetPasswordPage } from "@/pages/Auth/ResetPasswordPage";
import { paths } from "@/routes/paths";
import { renderWithRouter } from "../../utils/renderWithRouter";

describe("ResetPasswordPage", () => {
  it("renders all reset password sections", () => {
    renderWithRouter(<ResetPasswordPage />);

    expect(
      screen.getByRole("heading", { name: "Reset Your Password" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Enter your email address and we'll send you a link to reset your password",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send Reset Link" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Return to Login" }),
    ).toHaveAttribute("href", paths.login);
    expect(screen.getByText("Canvas LMS")).toBeInTheDocument();
  });

  it("submits the form without navigating away", async () => {
    const user = userEvent.setup();

    renderWithRouter(<ResetPasswordPage />, {
      routerProps: { initialEntries: [paths.resetPassword] },
    });

    await user.type(
      screen.getByLabelText("Email Address"),
      "you@university.edu",
    );
    await user.click(screen.getByRole("button", { name: "Send Reset Link" }));

    expect(screen.getByLabelText("Email Address")).toHaveValue(
      "you@university.edu",
    );
  });
});
