import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ResetPasswordFooter } from "@/pages/Auth/ResetPassword/ResetPasswordFooter";
import { paths } from "@/routes/paths";
import { renderWithRouter } from "../../../utils/renderWithRouter";

describe("ResetPasswordFooter", () => {
  // Verifies: Renders the powered by branding.
  it("renders the powered by branding", () => {
    renderWithRouter(<ResetPasswordFooter />);

    expect(screen.getByText(/Powered by/)).toBeInTheDocument();
    expect(screen.getByText("Canvas LMS")).toBeInTheDocument();
  });

  // Verifies: Links to the login page.
  it("links to the login page", () => {
    renderWithRouter(<ResetPasswordFooter />);

    const loginLink = screen.getByRole("link", { name: "Return to Login" });
    expect(loginLink).toHaveAttribute("href", paths.login);
  });
});
