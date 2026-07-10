import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RegisterHeader } from "@/pages/Auth/Register/RegisterHeader";

describe("RegisterHeader", () => {
  // Verifies: Renders the application name.
  it("renders the application name", () => {
    render(<RegisterHeader />);

    expect(
      screen.getByText("Canvas Workflow Assistant"),
    ).toBeInTheDocument();
  });

  // Verifies: Renders the graduation cap icon.
  it("renders the graduation cap icon", () => {
    const { container } = render(<RegisterHeader />);

    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
