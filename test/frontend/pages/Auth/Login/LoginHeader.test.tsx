import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoginHeader } from "@/pages/Auth/Login/LoginHeader";

describe("LoginHeader", () => {
  // Verifies: Renders the application name.
  it("renders the application name", () => {
    render(<LoginHeader />);

    expect(
      screen.getByText("Canvas Workflow Assistant"),
    ).toBeInTheDocument();
  });

  // Verifies: Renders the graduation cap icon.
  it("renders the graduation cap icon", () => {
    const { container } = render(<LoginHeader />);

    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
