import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { RegisterForm } from "@/pages/Auth/Register/RegisterForm";
import { renderWithRouter } from "../../../utils/renderWithRouter";

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Full Name"), "Dr. Jane Smith");
  await user.type(screen.getByLabelText("Email Address"), "professor@university.edu");
  await user.type(screen.getByLabelText("Password"), "secret123");
  await user.type(screen.getByLabelText("Confirm Password"), "secret123");
  await user.click(
    screen.getByLabelText(
      "I agree to the Terms of Service and Privacy Policy",
    ),
  );
}

describe("RegisterForm", () => {
  it("renders all form fields", () => {
    renderWithRouter(<RegisterForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText("Full Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email Address")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm Password")).toBeInTheDocument();
  });

  it("renders field placeholders", () => {
    renderWithRouter(<RegisterForm onSubmit={vi.fn()} />);

    expect(screen.getByPlaceholderText("Dr. Jane Smith")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("professor@university.edu"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Create a strong password"),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Re-enter your password"),
    ).toBeInTheDocument();
  });

  it("renders terms checkbox and policy links", () => {
    renderWithRouter(<RegisterForm onSubmit={vi.fn()} />);

    expect(
      screen.getByLabelText(
        "I agree to the Terms of Service and Privacy Policy",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Terms of Service" }),
    ).toHaveAttribute("href", "/#terms");
    expect(
      screen.getByRole("link", { name: "Privacy Policy" }),
    ).toHaveAttribute("href", "/#privacy");
  });

  it("renders the create account submit button disabled by default", () => {
    renderWithRouter(<RegisterForm onSubmit={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Create Account" }),
    ).toBeDisabled();
  });

  it("keeps the submit button disabled until all fields and terms are complete", async () => {
    const user = userEvent.setup();

    renderWithRouter(<RegisterForm onSubmit={vi.fn()} />);

    const submitButton = screen.getByRole("button", { name: "Create Account" });

    await user.type(screen.getByLabelText("Full Name"), "Dr. Jane Smith");
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText("Email Address"), "professor@university.edu");
    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.type(screen.getByLabelText("Confirm Password"), "secret123");
    expect(submitButton).toBeDisabled();

    await user.click(
      screen.getByLabelText(
        "I agree to the Terms of Service and Privacy Policy",
      ),
    );
    expect(submitButton).toBeEnabled();
  });

  it("shows a password mismatch error when passwords do not match", async () => {
    const user = userEvent.setup();

    renderWithRouter(<RegisterForm onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.type(screen.getByLabelText("Confirm Password"), "different");

    expect(screen.getByRole("alert")).toHaveTextContent("Passwords must match");
    expect(
      screen.getByRole("button", { name: "Create Account" }),
    ).toBeDisabled();
  });

  it("does not show password mismatch error before confirm password is entered", async () => {
    const user = userEvent.setup();

    renderWithRouter(<RegisterForm onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText("Password"), "secret123");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears password mismatch error when passwords match", async () => {
    const user = userEvent.setup();

    renderWithRouter(<RegisterForm onSubmit={vi.fn()} />);

    const confirmPasswordInput = screen.getByLabelText("Confirm Password");

    await user.type(screen.getByLabelText("Password"), "secret123");
    await user.type(confirmPasswordInput, "different");
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.clear(confirmPasswordInput);
    await user.type(confirmPasswordInput, "secret123");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("calls onSubmit when the form is submitted", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: FormEvent<HTMLFormElement>) => e.preventDefault());

    renderWithRouter(<RegisterForm onSubmit={onSubmit} />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Create Account" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("allows typing into form fields", async () => {
    const user = userEvent.setup();

    renderWithRouter(<RegisterForm onSubmit={vi.fn()} />);

    const nameInput = screen.getByLabelText("Full Name");
    const emailInput = screen.getByLabelText("Email Address");
    const passwordInput = screen.getByLabelText("Password");
    const confirmPasswordInput = screen.getByLabelText("Confirm Password");

    await user.type(nameInput, "Dr. Jane Smith");
    await user.type(emailInput, "professor@university.edu");
    await user.type(passwordInput, "secret123");
    await user.type(confirmPasswordInput, "secret123");

    expect(nameInput).toHaveValue("Dr. Jane Smith");
    expect(emailInput).toHaveValue("professor@university.edu");
    expect(passwordInput).toHaveValue("secret123");
    expect(confirmPasswordInput).toHaveValue("secret123");
  });
});
