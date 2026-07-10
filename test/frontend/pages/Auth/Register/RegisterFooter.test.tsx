import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RegisterFooter } from "@/pages/Auth/Register/RegisterFooter";
import { paths } from "@/routes/paths";
import { renderWithRouter } from "../../../utils/renderWithRouter";

describe("RegisterFooter", () => {
  // Verifies: Renders the account prompt text.
  it("renders the account prompt text", () => {
    renderWithRouter(<RegisterFooter />);

    expect(screen.getByText(/Already have an account\?/)).toBeInTheDocument();
  });

  // Verifies: Links to the login page.
  it("links to the login page", () => {
    renderWithRouter(<RegisterFooter />);

    const signInLink = screen.getByRole("link", { name: "Sign in" });
    expect(signInLink).toHaveAttribute("href", paths.login);
  });

  // Verifies: Links to the home page.
  it("links to the home page", () => {
    renderWithRouter(<RegisterFooter />);

    const homeLink = screen.getByRole("link", { name: "Back to home" });
    expect(homeLink).toHaveAttribute("href", paths.home);
  });
});
