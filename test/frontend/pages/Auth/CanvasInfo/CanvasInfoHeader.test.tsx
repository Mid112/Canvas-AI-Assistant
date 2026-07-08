import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CanvasInfoHeader } from "@/pages/Auth/CanvasInfo/CanvasInfoHeader";

describe("CanvasInfoHeader", () => {
  // Verifies: Renders the connect canvas heading.
  it("renders the connect canvas heading", () => {
    render(<CanvasInfoHeader />);

    expect(
      screen.getByRole("heading", { name: "Connect Your Canvas Account" }),
    ).toBeInTheDocument();
  });

  // Verifies: Renders the description text.
  it("renders the description text", () => {
    render(<CanvasInfoHeader />);

    expect(
      screen.getByText(
        "Link your Canvas LMS to enable AI-powered workflow assistance",
      ),
    ).toBeInTheDocument();
  });

  // Verifies: Renders the graduation cap icon.
  it("renders the graduation cap icon", () => {
    const { container } = render(<CanvasInfoHeader />);

    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
