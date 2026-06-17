import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReviewPermissionsActions } from "@/pages/Auth/ReviewPermissions/ReviewPermissionsActions";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("ReviewPermissionsActions", () => {
  it("renders cancel and approve buttons", () => {
    renderWithRouter(
      <ReviewPermissionsActions onCancel={vi.fn()} onApprove={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Approve & Continue" }),
    ).toBeInTheDocument();
  });

  it("calls onCancel when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    renderWithRouter(
      <ReviewPermissionsActions onCancel={onCancel} onApprove={vi.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onApprove when approve is clicked", async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();

    renderWithRouter(
      <ReviewPermissionsActions onCancel={vi.fn()} onApprove={onApprove} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Approve & Continue" }),
    );

    expect(onApprove).toHaveBeenCalledTimes(1);
  });
});
