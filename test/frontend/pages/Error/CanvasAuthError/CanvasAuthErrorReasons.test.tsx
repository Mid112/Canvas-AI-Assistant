import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CanvasAuthErrorReasons } from "@/pages/Error/CanvasAuthError/CanvasAuthErrorReasons";

describe("CanvasAuthErrorReasons", () => {
  // Verifies: Renders all failure reasons.
  it("renders all failure reasons", () => {
    render(<CanvasAuthErrorReasons />);

    expect(
      screen.getByText("Invalid Canvas credentials or API token"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Canvas server is temporarily unavailable"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Insufficient permissions on your Canvas account"),
    ).toBeInTheDocument();
    expect(screen.getByText("Network connectivity issues")).toBeInTheDocument();
  });
});
