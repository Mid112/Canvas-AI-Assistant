import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ResetPasswordHeader } from "@/pages/Auth/ResetPassword/ResetPasswordHeader";

describe("ResetPasswordHeader", () => {
  it("renders the reset password heading", () => {
    render(<ResetPasswordHeader />);

    expect(
      screen.getByRole("heading", { name: "Reset Your Password" }),
    ).toBeInTheDocument();
  });

  it("renders the description text", () => {
    render(<ResetPasswordHeader />);

    expect(
      screen.getByText(
        "Enter your email address and we'll send you a link to reset your password",
      ),
    ).toBeInTheDocument();
  });

  it("renders the graduation cap icon", () => {
    const { container } = render(<ResetPasswordHeader />);

    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
