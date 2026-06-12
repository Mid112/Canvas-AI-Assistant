import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConnectCanvasForm } from "@/pages/Auth/ConnectCanvas/ConnectCanvasForm";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("ConnectCanvasForm", () => {
  it("renders the token field and submit button", () => {
    renderWithRouter(<ConnectCanvasForm onSubmit={vi.fn()} />);

    expect(screen.getByLabelText("Canvas API Token")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect Canvas" }),
    ).toBeInTheDocument();
  });

  it("disables submit until a token is entered", async () => {
    const user = userEvent.setup();
    renderWithRouter(<ConnectCanvasForm onSubmit={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Connect Canvas" }),
    ).toBeDisabled();

    await user.type(screen.getByLabelText("Canvas API Token"), "abc123");

    expect(
      screen.getByRole("button", { name: "Connect Canvas" }),
    ).toBeEnabled();
  });

  it("submits the trimmed token", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    renderWithRouter(<ConnectCanvasForm onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Canvas API Token"), "  my-token  ");
    await user.click(screen.getByRole("button", { name: "Connect Canvas" }));

    expect(onSubmit).toHaveBeenCalledWith({ canvasToken: "my-token" });
  });

  it("shows an error message when provided", () => {
    renderWithRouter(
      <ConnectCanvasForm
        error="Unable to connect Canvas. Please check your token and try again."
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to connect Canvas. Please check your token and try again.",
    );
  });
});
