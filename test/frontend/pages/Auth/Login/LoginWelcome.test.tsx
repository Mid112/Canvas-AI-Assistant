import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoginWelcome } from "@/pages/Auth/Login/LoginWelcome";

describe("LoginWelcome", () => {
  it("renders the welcome heading", () => {
    render(<LoginWelcome />);

    expect(
      screen.getByRole("heading", { name: "Welcome Back" }),
    ).toBeInTheDocument();
  });

  it("renders the sign-in subtitle", () => {
    render(<LoginWelcome />);

    expect(
      screen.getByText(/Sign in to manage your Canvas workflows/),
    ).toBeInTheDocument();
  });
});
