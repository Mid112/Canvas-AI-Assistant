// Test note: covers the register form.test behavior so future changes can preserve the expected Canvas workflow contract.

import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RegisterForm } from "@/pages/Auth/Register/RegisterForm";
import { renderWithRouter } from "../../../utils/renderWithRouter";

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("First Name"), "Jane");
  await user.type(screen.getByLabelText("Last Name"), "Smith");
  await user.type(screen.getByLabelText("Email Address"), "professor@university.edu");
  await user.type(screen.getByLabelText("Password"), "Secret123!");
  await user.type(screen.getByLabelText("Confirm Password"), "Secret123!");
  await user.click(
    screen.getByLabelText(
      "I agree to the Terms of Service and Privacy Policy",
    ),
  );
}

describe("RegisterForm", () => {
  // Verifies: Renders terms checkbox and policy links.
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

  // Verifies: Renders the create account submit button disabled by default.
  it("renders the create account submit button disabled by default", () => {
    renderWithRouter(<RegisterForm onSubmit={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Create Account" }),
    ).toBeDisabled();
  });

  // Verifies: Keeps the submit button disabled until all fields and terms are complete.
  it("keeps the submit button disabled until all fields and terms are complete", async () => {
    const user = userEvent.setup();

    renderWithRouter(<RegisterForm onSubmit={vi.fn()} />);

    const submitButton = screen.getByRole("button", { name: "Create Account" });

    await user.type(screen.getByLabelText("First Name"), "Jane");
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText("Last Name"), "Smith");
    expect(submitButton).toBeDisabled();

    await user.type(screen.getByLabelText("Email Address"), "professor@university.edu");
    await user.type(screen.getByLabelText("Password"), "Secret123!");
    await user.type(screen.getByLabelText("Confirm Password"), "Secret123!");
    expect(submitButton).toBeDisabled();

    await user.click(
      screen.getByLabelText(
        "I agree to the Terms of Service and Privacy Policy",
      ),
    );
    expect(submitButton).toBeEnabled();
  });

  // Verifies (#1451): Mismatch error appears beside Confirm Password before submit.
  it("shows a password mismatch error when passwords do not match", async () => {
    const user = userEvent.setup();

    renderWithRouter(<RegisterForm onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText("Password"), "Secret123!");
    await user.type(screen.getByLabelText("Confirm Password"), "different");

    const confirmPasswordInput = screen.getByLabelText("Confirm Password");
    const mismatchAlert = screen.getByRole("alert");

    expect(mismatchAlert).toHaveTextContent(
      "Confirm password must match the password above",
    );
    expect(confirmPasswordInput).toHaveAttribute("aria-invalid", "true");
    expect(confirmPasswordInput).toHaveAttribute(
      "aria-describedby",
      "confirm-password-mismatch",
    );
    expect(
      confirmPasswordInput.closest(".space-y-2"),
    ).toContainElement(mismatchAlert);
    expect(
      screen.getByRole("button", { name: "Create Account" }),
    ).toBeDisabled();
  });

  // Verifies: Does not show password mismatch error before confirm password is entered.
  it("does not show password mismatch error before confirm password is entered", async () => {
    const user = userEvent.setup();

    renderWithRouter(<RegisterForm onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText("Password"), "Secret123!");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // Verifies: Clears password mismatch error when passwords match.
  it("clears password mismatch error when passwords match", async () => {
    const user = userEvent.setup();

    renderWithRouter(<RegisterForm onSubmit={vi.fn()} />);

    const confirmPasswordInput = screen.getByLabelText("Confirm Password");

    await user.type(screen.getByLabelText("Password"), "Secret123!");
    await user.type(confirmPasswordInput, "different");
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.clear(confirmPasswordInput);
    await user.type(confirmPasswordInput, "Secret123!");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Password confirmation" }),
    ).toHaveTextContent("Passwords match");
    expect(confirmPasswordInput).not.toHaveAttribute("aria-invalid", "true");
  });

  // Verifies: Calls onSubmit with credentials when the form is submitted.
  it("calls onSubmit with credentials when the form is submitted", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithRouter(<RegisterForm onSubmit={onSubmit} />);

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Create Account" }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Jane Smith",
      email: "professor@university.edu",
      password: "Secret123!",
    });
  });
  // Verifies: Shows an email validation error for invalid addresses.
  it("shows an email validation error for invalid addresses", async () => {
    const user = userEvent.setup();

    renderWithRouter(<RegisterForm onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText("Email Address"), "invalid-email");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a valid email address",
    );
    expect(
      screen.getByRole("button", { name: "Create Account" }),
    ).toBeDisabled();
  });

  // Verifies (#1451): Password checklist appears and checks off met rules.
  it("shows a password requirements checklist that updates as rules are met", async () => {
    const user = userEvent.setup();

    renderWithRouter(<RegisterForm onSubmit={vi.fn()} />);

    const checklist = screen.getByRole("list", { name: "Password requirements" });
    expect(
      checklist.querySelector('[data-requirement="length"]'),
    ).toHaveAttribute("data-met", "false");

    await user.type(screen.getByLabelText("Password"), "Secret123!");

    expect(
      checklist.querySelector('[data-requirement="length"]'),
    ).toHaveAttribute("data-met", "true");
    expect(
      checklist.querySelector('[data-requirement="uppercase"]'),
    ).toHaveAttribute("data-met", "true");
    expect(
      checklist.querySelector('[data-requirement="lowercase"]'),
    ).toHaveAttribute("data-met", "true");
    expect(
      checklist.querySelector('[data-requirement="number"]'),
    ).toHaveAttribute("data-met", "true");
    expect(
      checklist.querySelector('[data-requirement="symbol"]'),
    ).toHaveAttribute("data-met", "true");
    expect(
      screen.getByRole("button", { name: "Create Account" }),
    ).toBeDisabled();
  });

  // Verifies: Shows a terms reminder when required fields are complete but terms are unchecked.
  it("shows a terms reminder when required fields are complete but terms are unchecked", async () => {
    const user = userEvent.setup();

    renderWithRouter(<RegisterForm onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText("First Name"), "Jane");
    await user.type(screen.getByLabelText("Last Name"), "Smith");
    await user.type(screen.getByLabelText("Email Address"), "professor@university.edu");
    await user.type(screen.getByLabelText("Password"), "Secret123!");
    await user.type(screen.getByLabelText("Confirm Password"), "Secret123!");

    expect(
      screen.getByText(
        "Accept the Terms of Service and Privacy Policy to continue.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Password confirmation" }),
    ).toHaveTextContent("Passwords match");
  });

  // Verifies: Does not submit when the form is incomplete.
  it("does not submit when the form is incomplete", () => {
    const onSubmit = vi.fn();

    renderWithRouter(<RegisterForm onSubmit={onSubmit} />);

    fireEvent.submit(
      screen.getByRole("button", { name: "Create Account" }).closest("form")!,
    );

    expect(onSubmit).not.toHaveBeenCalled();
  });

  // Verifies: Does not submit while a submission is already in progress.
  it("does not submit while a submission is already in progress", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    renderWithRouter(<RegisterForm onSubmit={onSubmit} isSubmitting />);

    await fillValidForm(user);
    fireEvent.submit(
      screen.getByRole("button", { name: "Creating Account..." }).closest("form")!,
    );

    expect(onSubmit).not.toHaveBeenCalled();
  });

  // Verifies (#1451): Confirm-first typing must not show mismatch against a blank password.
  it("does not show mismatch when password is still empty", async () => {
    const user = userEvent.setup();

    renderWithRouter(<RegisterForm onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText("Confirm Password"), "Secret123!");

    expect(
      screen.queryByText("Confirm password must match the password above"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Confirm Password")).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

});
