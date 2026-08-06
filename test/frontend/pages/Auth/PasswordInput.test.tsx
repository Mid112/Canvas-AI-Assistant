// Test note: covers the password input.test behavior so future changes can preserve the expected Canvas workflow contract.

import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PasswordInput } from "@/pages/Auth/PasswordInput";
import { renderWithRouter } from "../../utils/renderWithRouter";

describe("PasswordInput", () => {
  it("toggles password visibility", async () => {
    const user = userEvent.setup();

    renderWithRouter(
      <>
        <label htmlFor="password">Password</label>
        <PasswordInput id="password" defaultValue="Secret123!" />
      </>,
    );

    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");
    expect(
      screen.getByRole("button", { name: "Hide password" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
  });
});
