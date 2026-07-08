import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CanvasInfoActions } from "@/pages/Auth/CanvasInfo/CanvasInfoActions";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("CanvasInfoActions", () => {
  // Verifies: Renders the proceed button.
  it("renders the proceed button", () => {
    renderWithRouter(<CanvasInfoActions onProceed={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Proceed to Connect" }),
    ).toBeInTheDocument();
  });

  // Verifies: Renders terms and privacy links.
  it("renders terms and privacy links", () => {
    renderWithRouter(<CanvasInfoActions onProceed={vi.fn()} />);

    expect(
      screen.getByText(/By connecting, you agree to our/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute(
      "href",
      "/#terms",
    );
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "/#privacy",
    );
  });

  // Verifies: Calls onProceed when the button is clicked.
  it("calls onProceed when the button is clicked", async () => {
    const user = userEvent.setup();
    const onProceed = vi.fn();

    renderWithRouter(<CanvasInfoActions onProceed={onProceed} />);

    await user.click(
      screen.getByRole("button", { name: "Proceed to Connect" }),
    );

    expect(onProceed).toHaveBeenCalledTimes(1);
  });
});
