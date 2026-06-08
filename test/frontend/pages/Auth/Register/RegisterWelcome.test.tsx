import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RegisterWelcome } from "@/pages/Auth/Register/RegisterWelcome";

describe("RegisterWelcome", () => {
  it("renders the create account heading", () => {
    render(<RegisterWelcome />);

    expect(
      screen.getByRole("heading", { name: "Create Account" }),
    ).toBeInTheDocument();
  });

  it("renders the sign-up subtitle", () => {
    render(<RegisterWelcome />);

    expect(
      screen.getByText("Get started with Canvas workflow automation."),
    ).toBeInTheDocument();
  });
});
