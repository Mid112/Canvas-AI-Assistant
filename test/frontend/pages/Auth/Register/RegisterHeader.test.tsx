import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RegisterHeader } from "@/pages/Auth/Register/RegisterHeader";

describe("RegisterHeader", () => {
  it("renders the application name", () => {
    render(<RegisterHeader />);

    expect(
      screen.getByText("Canvas Workflow Assistant"),
    ).toBeInTheDocument();
  });

  it("renders the graduation cap icon", () => {
    const { container } = render(<RegisterHeader />);

    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
