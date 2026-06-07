import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoginHeader } from "@/pages/Auth/Login/LoginHeader";

describe("LoginHeader", () => {
  it("renders the application name", () => {
    render(<LoginHeader />);

    expect(
      screen.getByText("Canvas Workflow Assistant"),
    ).toBeInTheDocument();
  });

  it("renders the graduation cap icon", () => {
    const { container } = render(<LoginHeader />);

    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
