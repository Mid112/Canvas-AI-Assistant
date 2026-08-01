import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReviewPermissionsActions } from "@/pages/Auth/ReviewPermissions/ReviewPermissionsActions";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("ReviewPermissionsActions", () => {
  // Verifies: Renders reconnect and approve buttons.
  it("renders reconnect and approve buttons", () => {
    renderWithRouter(
      <ReviewPermissionsActions onReconnect={vi.fn()} onApprove={vi.fn()} />,
    );

    expect(
      screen.getByRole("button", { name: "Reconnect Canvas" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve & Continue" }),
    ).toBeInTheDocument();
  });

  // Verifies: Calls onReconnect when reconnect is clicked.
  it("calls onReconnect when reconnect is clicked", async () => {
    const user = userEvent.setup();
    const onReconnect = vi.fn();

    renderWithRouter(
      <ReviewPermissionsActions onReconnect={onReconnect} onApprove={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Reconnect Canvas" }));

    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  // Verifies: Calls onApprove when approve is clicked.
  it("calls onApprove when approve is clicked", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();

    renderWithRouter(
      <ReviewPermissionsActions onReconnect={vi.fn()} onApprove={onApprove} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Approve & Continue" }),
    );

    expect(onApprove).toHaveBeenCalledTimes(1);
  });
});
