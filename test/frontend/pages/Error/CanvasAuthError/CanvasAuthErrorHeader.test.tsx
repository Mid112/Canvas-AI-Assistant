import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CanvasAuthErrorHeader } from "@/pages/Error/CanvasAuthError/CanvasAuthErrorHeader";

describe("CanvasAuthErrorHeader", () => {
  it("renders the error heading and description", () => {
    render(<CanvasAuthErrorHeader />);

    expect(
      screen.getByRole("heading", { name: "Canvas Authentication Failed" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "We couldn't connect to your Canvas account. This could be due to:",
      ),
    ).toBeInTheDocument();
  });
});
