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

    await user.type(screen.getByLabelText("New Password"), "secret123");
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
    expect(confirmPasswordInput.parentElement).toContainElement(mismatchAlert);
    expect(
      screen.getByRole("button", { name: "Update Password" }),
    ).toBeDisabled();
  });

  it("does not show password mismatch before confirm password is entered", async () => {
    const user = userEvent.setup();

    renderWithRouter(<ResetPasswordConfirmForm onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText("New Password"), "secret123");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears the mismatch error when passwords match", async () => {
    const user = userEvent.setup();

    renderWithRouter(<ResetPasswordConfirmForm onSubmit={vi.fn()} />);

    const confirmPasswordInput = screen.getByLabelText("Confirm Password");

    await user.type(screen.getByLabelText("New Password"), "secret123");
    await user.type(confirmPasswordInput, "different");
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.clear(confirmPasswordInput);
    await user.type(confirmPasswordInput, "secret123");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(confirmPasswordInput).not.toHaveAttribute("aria-invalid", "true");
    expect(
      screen.getByRole("button", { name: "Update Password" }),
    ).toBeEnabled();
  });

  it("calls onSubmit with the new password when the form is valid", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithRouter(<ResetPasswordConfirmForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("New Password"), "secret123");
    await user.type(screen.getByLabelText("Confirm Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Update Password" }));

    expect(onSubmit).toHaveBeenCalledWith("secret123");
  });
});
