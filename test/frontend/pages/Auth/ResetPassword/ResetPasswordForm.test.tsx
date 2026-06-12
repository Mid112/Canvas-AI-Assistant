import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ResetPasswordForm } from "@/pages/Auth/ResetPassword/ResetPasswordForm";
import { renderWithRouter } from "../../../utils/renderWithRouter";

describe("ResetPasswordForm", () => {
  it("renders the email field", () => {
    renderWithRouter(<ResetPasswordForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
  });

  it("renders the email placeholder", () => {
    renderWithRouter(<ResetPasswordForm onSubmit={vi.fn()} />);

    expect(
      screen.getByPlaceholderText("you@university.edu"),
    ).toBeInTheDocument();
  });

  it("renders the send reset link submit button disabled by default", () => {
    renderWithRouter(<ResetPasswordForm onSubmit={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Send Reset Link" }),
    ).toBeDisabled();
  });

  it("shows an email validation error for invalid addresses", async () => {
    const user = userEvent.setup();

    renderWithRouter(<ResetPasswordForm onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText("Email Address"), "invalid-email");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a valid email address",
    );
  });

  it("calls onSubmit and shows success message for valid email", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithRouter(<ResetPasswordForm onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText("Email Address"),
      "you@university.edu",
    );
    await user.click(screen.getByRole("button", { name: "Send Reset Link" }));

    expect(onSubmit).toHaveBeenCalledWith("you@university.edu");
    expect(screen.getByRole("status")).toHaveTextContent(
      "If an account exists for you@university.edu",
    );
  });

  it("allows typing into the email field", async () => {
    const user = userEvent.setup();

    renderWithRouter(<ResetPasswordForm onSubmit={vi.fn()} />);

    const emailInput = screen.getByLabelText("Email Address");

    await user.type(emailInput, "you@university.edu");

    expect(emailInput).toHaveValue("you@university.edu");
  });
});
