import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEvent } from "react";
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

  it("renders the send reset link submit button", () => {
    renderWithRouter(<ResetPasswordForm onSubmit={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Send Reset Link" }),
    ).toBeInTheDocument();
  });

  it("calls onSubmit when the form is submitted", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: FormEvent<HTMLFormElement>) => e.preventDefault());

    renderWithRouter(<ResetPasswordForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Send Reset Link" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("allows typing into the email field", async () => {
    const user = userEvent.setup();

    renderWithRouter(<ResetPasswordForm onSubmit={vi.fn()} />);

    const emailInput = screen.getByLabelText("Email Address");

    await user.type(emailInput, "you@university.edu");

    expect(emailInput).toHaveValue("you@university.edu");
  });
});
