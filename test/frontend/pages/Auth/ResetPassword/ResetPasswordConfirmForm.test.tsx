// Test note: covers the reset password confirm form.test behavior so future changes can preserve the expected Canvas workflow contract.

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ResetPasswordConfirmForm } from "@/pages/Auth/ResetPassword/ResetPasswordConfirmForm";
import { renderWithRouter } from "../../../utils/renderWithRouter";

describe("ResetPasswordConfirmForm", () => {
  // Verifies (#1451): Mismatch feedback is immediate and next to Confirm Password.
  it("shows a password mismatch error beside the confirm field", async () => {
    const user = userEvent.setup();

    renderWithRouter(<ResetPasswordConfirmForm onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText("New Password"), "Secret123!");
    await user.type(screen.getByLabelText("Confirm Password"), "different");

    const confirmPasswordInput = screen.getByLabelText("Confirm Password");
    const mismatchAlert = screen.getByRole("alert");

    expect(mismatchAlert).toHaveTextContent(
      "Confirm password must match the password above",
    );
    expect(confirmPasswordInput).toHaveAttribute("aria-invalid", "true");
    expect(confirmPasswordInput).toHaveAttribute(
      "aria-describedby",
      "reset-confirm-password-mismatch",
    );
    expect(
      confirmPasswordInput.closest(".space-y-2"),
    ).toContainElement(mismatchAlert);
    expect(
      screen.getByRole("button", { name: "Update Password" }),
    ).toBeDisabled();
  });

  it("does not show password mismatch before confirm password is entered", async () => {
    const user = userEvent.setup();

    renderWithRouter(<ResetPasswordConfirmForm onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText("New Password"), "Secret123!");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears the mismatch error when passwords match", async () => {
    const user = userEvent.setup();

    renderWithRouter(<ResetPasswordConfirmForm onSubmit={vi.fn()} />);

    const confirmPasswordInput = screen.getByLabelText("Confirm Password");

    await user.type(screen.getByLabelText("New Password"), "Secret123!");
    await user.type(confirmPasswordInput, "different");
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.clear(confirmPasswordInput);
    await user.type(confirmPasswordInput, "Secret123!");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Password confirmation" }),
    ).toHaveTextContent("Passwords match");
    expect(confirmPasswordInput).not.toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByRole("button", { name: "Update Password" }),
    ).toBeEnabled();
  });

  it("calls onSubmit with the new password when the form is valid", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithRouter(<ResetPasswordConfirmForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("New Password"), "Secret123!");
    await user.type(screen.getByLabelText("Confirm Password"), "Secret123!");
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    expect(onSubmit).toHaveBeenCalledWith("Secret123!");
  });
});
