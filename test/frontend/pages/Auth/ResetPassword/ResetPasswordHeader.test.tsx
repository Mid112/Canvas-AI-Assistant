import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ResetPasswordHeader } from "@/pages/Auth/ResetPassword/ResetPasswordHeader";

describe("ResetPasswordHeader", () => {
  // Verifies: Renders the reset password heading.
  it("renders the reset password heading", () => {
    render(<ResetPasswordHeader />);

    expect(
      screen.getByRole("heading", { name: "Reset Your Password" }),
    ).toBeInTheDocument();
  });

  // Verifies: Renders the description text.
  it("renders the description text", () => {
    render(<ResetPasswordHeader />);

    expect(
      screen.getByText(
        "Enter your email address and we'll send you a link to reset your password",
      ),
    ).toBeInTheDocument();
  });

  // Verifies: Renders the graduation cap icon.
  it("renders the graduation cap icon", () => {
    const { container } = render(<ResetPasswordHeader />);

    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
