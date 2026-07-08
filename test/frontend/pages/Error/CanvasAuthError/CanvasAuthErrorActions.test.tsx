import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  CanvasAuthErrorActions,
  CanvasAuthErrorFooter,
} from "@/pages/Error/CanvasAuthError/CanvasAuthErrorActions";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("CanvasAuthErrorActions", () => {
  it("renders retry, contact, and return actions", () => {
    renderWithRouter(
      <CanvasAuthErrorActions onRetry={vi.fn()} onReturnToLogin={vi.fn()} />,
    );

    expect(
      screen.getByRole("button", { name: "Retry Connection" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Contact Administrator" }),
    ).toHaveAttribute("href", "mailto:support@institution.edu");
    expect(
      screen.getByRole("button", { name: "Return to Login" }),
    ).toBeInTheDocument();
  });

  it("calls onRetry when retry is clicked", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    renderWithRouter(
      <CanvasAuthErrorActions onRetry={onRetry} onReturnToLogin={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Retry Connection" }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("calls onReturnToLogin when return is clicked", async () => {
    const user = userEvent.setup();
    const onReturnToLogin = vi.fn();

    renderWithRouter(
      <CanvasAuthErrorActions
        onRetry={vi.fn()}
        onReturnToLogin={onReturnToLogin}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Return to Login" }));

    expect(onReturnToLogin).toHaveBeenCalledTimes(1);
  });
});

describe("CanvasAuthErrorFooter", () => {
  it("renders the support footer text", () => {
    renderWithRouter(<CanvasAuthErrorFooter />);

    expect(
      screen.getByText("Need help? Contact your institution's IT support team"),
    ).toBeInTheDocument();
  });
});
