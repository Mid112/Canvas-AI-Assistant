import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/pages/Auth/Login/LoginForm";

describe("LoginForm", () => {
  it("renders email and password fields", () => {
    render(<LoginForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("renders field placeholders", () => {
    render(<LoginForm onSubmit={vi.fn()} />);

    expect(
      screen.getByPlaceholderText("professor@university.edu"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Enter your password"),
    ).toBeInTheDocument();
  });

  it("renders remember me checkbox and forgot password button", () => {
    render(<LoginForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText("Remember me")).toBeInTheDocument();
    expect(screen.getByText("Remember me")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Forgot password?" }),
    ).toBeInTheDocument();
  });

  it("renders the sign in submit button", () => {
    render(<LoginForm onSubmit={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Sign In" }),
    ).toBeInTheDocument();
  });

  it("calls onSubmit when the form is submitted", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: FormEvent<HTMLFormElement>) => e.preventDefault());

    render(<LoginForm onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("allows typing into email and password fields", async () => {
    const user = userEvent.setup();

    render(<LoginForm onSubmit={vi.fn()} />);

    const emailInput = screen.getByLabelText("Email Address");
    const passwordInput = screen.getByLabelText("Password");

    await user.type(emailInput, "professor@university.edu");
    await user.type(passwordInput, "secret123");

    expect(emailInput).toHaveValue("professor@university.edu");
    expect(passwordInput).toHaveValue("secret123");
  });
});
