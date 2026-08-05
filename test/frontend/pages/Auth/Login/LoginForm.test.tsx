import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/pages/Auth/Login/LoginForm";
import { renderWithRouter } from "../../../utils/renderWithRouter";

describe("LoginForm", () => {
  // Verifies: Renders email and password fields.
  it("renders email and password fields", () => {
    renderWithRouter(<LoginForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  // Verifies: Renders field placeholders.
  it("renders field placeholders", () => {
    renderWithRouter(<LoginForm onSubmit={vi.fn()} />);

    expect(
      screen.getByPlaceholderText("professor@university.edu"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Enter your password"),
    ).toBeInTheDocument();
  });

  // Verifies: Renders remember me checkbox and forgot password link.
  it("renders remember me checkbox and forgot password link", () => {
    renderWithRouter(<LoginForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText("Remember me")).toBeInTheDocument();
    expect(screen.getByText("Remember me")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Forgot password?" }),
    ).toHaveAttribute("href", "/reset-password");
  });

  // Verifies: Renders the sign in submit button disabled by default.
  it("renders the sign in submit button disabled by default", () => {
    renderWithRouter(<LoginForm onSubmit={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Sign In" })).toBeDisabled();
  });

  // Verifies: Enables submit when email and password are filled.
  it("enables submit when email and password are filled", async () => {
    const user = userEvent.setup();

    renderWithRouter(<LoginForm onSubmit={vi.fn()} />);

    const submitButton = screen.getByRole("button", { name: "Sign In" });

    await user.type(
      screen.getByLabelText("Email Address"),
      "professor@university.edu",
    );
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText("Password"), "secret123");
    expect(submitButton).toBeEnabled();
  });

  // Verifies: Calls onSubmit with credentials when the form is submitted.
  it("calls onSubmit with credentials when the form is submitted", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithRouter(<LoginForm onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText("Email Address"),
      "professor@university.edu",
    );
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(onSubmit).toHaveBeenCalledWith({
      email: "professor@university.edu",
      password: "secret123",
    });
  });

  // Verifies: Allows typing into email and password fields.
  it("allows typing into email and password fields", async () => {
    const user = userEvent.setup();

    renderWithRouter(<LoginForm onSubmit={vi.fn()} />);

    const emailInput = screen.getByLabelText("Email Address");
    const passwordInput = screen.getByLabelText("Password");

    await user.type(emailInput, "professor@university.edu");
    await user.type(passwordInput, "secret123");

    expect(emailInput).toHaveValue("professor@university.edu");
    expect(passwordInput).toHaveValue("secret123");
  });

  // Verifies: Shows an error message when provided.
  it("shows an error message when provided", () => {
    renderWithRouter(
      <LoginForm onSubmit={vi.fn()} error="Invalid email or password." />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Invalid email or password.",
    );
  });

  // Verifies: Shows an email validation error for invalid addresses.
  it("shows an email validation error for invalid addresses", async () => {
    const user = userEvent.setup();

    renderWithRouter(<LoginForm onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText("Email Address"), "invalid-email");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a valid email address",
    );
    expect(screen.getByRole("button", { name: "Sign In" })).toBeDisabled();
  });

  // Verifies: Does not submit when the form is incomplete.
  it("does not submit when the form is incomplete", () => {
    const onSubmit = vi.fn();

    renderWithRouter(<LoginForm onSubmit={onSubmit} />);

    fireEvent.submit(
      screen.getByRole("button", { name: "Sign In" }).closest("form")!,
    );

    expect(onSubmit).not.toHaveBeenCalled();
  });

  // Verifies: Does not submit while a submission is already in progress.
  it("does not submit while a submission is already in progress", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithRouter(<LoginForm onSubmit={onSubmit} isSubmitting />);

    await user.type(
      screen.getByLabelText("Email Address"),
      "professor@university.edu",
    );
    await user.type(screen.getByLabelText("Password"), "secret123");
    fireEvent.submit(
      screen.getByRole("button", { name: "Signing In..." }).closest("form")!,
    );

    expect(onSubmit).not.toHaveBeenCalled();
  });

  // Verifies (#1451): Login password field uses the shared show/hide control.
  it("toggles password visibility from the shared PasswordInput control", async () => {
    const user = userEvent.setup();

    renderWithRouter(<LoginForm onSubmit={vi.fn()} />);

    const passwordInput = screen.getByLabelText("Password");
    expect(passwordInput).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(passwordInput).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });

  // Verifies (#1451): Valid email gets the same success border treatment as register.
  it("marks a valid email with aria-invalid false after correcting an invalid value", async () => {
    const user = userEvent.setup();

    renderWithRouter(<LoginForm onSubmit={vi.fn()} />);

    const emailInput = screen.getByLabelText("Email Address");
    await user.type(emailInput, "invalid-email");
    expect(emailInput).toHaveAttribute("aria-invalid", "true");

    await user.clear(emailInput);
    await user.type(emailInput, "professor@university.edu");
    expect(emailInput).toHaveAttribute("aria-invalid", "false");
  });

});
