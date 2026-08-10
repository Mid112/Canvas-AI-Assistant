import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ResetPasswordForm } from "@/pages/Auth/ResetPassword/ResetPasswordForm";
import { renderWithRouter } from "../../../utils/renderWithRouter";

describe("ResetPasswordForm", () => {  it("renders the send reset link submit button disabled by default", () => {
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

  it("calls onSubmit for a valid email", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithRouter(<ResetPasswordForm onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText("Email Address"),
      "you@university.edu",
    );
    await user.click(screen.getByRole("button", { name: "Send Reset Link" }));

    expect(onSubmit).toHaveBeenCalledWith("you@university.edu");
  });

  it("does not submit when the email is invalid", () => {
    const onSubmit = vi.fn();

    renderWithRouter(<ResetPasswordForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Email Address"), {
      target: { value: "invalid-email" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Send Reset Link" }).closest("form")!,
    );

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
