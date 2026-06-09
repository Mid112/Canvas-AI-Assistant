import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoginFooter } from "@/pages/Auth/Login/LoginFooter";
import { paths } from "@/routes/paths";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("LoginFooter", () => {
  it("renders the account prompt text", () => {
    renderWithRouter(<LoginFooter />);

    expect(screen.getByText(/Don't have an account\?/)).toBeInTheDocument();
  });

  it("links to the register page", () => {
    renderWithRouter(<LoginFooter />);

    const signUpLink = screen.getByRole("link", { name: "Sign up" });
    expect(signUpLink).toHaveAttribute("href", paths.register);
  });

  it("links to the home page", () => {
    renderWithRouter(<LoginFooter />);

    const homeLink = screen.getByRole("link", { name: "Back to home" });
    expect(homeLink).toHaveAttribute("href", paths.home);
  });
});
