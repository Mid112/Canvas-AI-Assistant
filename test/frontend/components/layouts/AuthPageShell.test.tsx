import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthPageShell } from "@/components/layouts/AuthPageShell";

describe("AuthPageShell", () => {
  // Verifies: Centers content by default.
  it("centers content by default", () => {
    const { container } = render(
      <AuthPageShell>
        <p>Sign in</p>
      </AuthPageShell>,
    );

    expect(screen.getByText("Sign in")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("items-center");
  });

  // Verifies: Uses scrollable layout when centered is false.
  it("uses scrollable layout when centered is false", () => {
    const { container } = render(
      <AuthPageShell centered={false}>
        <p>Register</p>
      </AuthPageShell>,
    );

    expect(screen.getByText("Register")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("overflow-y-auto");
    expect(container.firstChild).not.toHaveClass("items-center");
  });
});
