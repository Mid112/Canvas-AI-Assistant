import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ErrorAlert } from "@/components/common/ErrorAlert";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("ErrorAlert", () => {
  it("shows a Reconnect Canvas action for a Canvas token error", () => {
    renderWithRouter(<ErrorAlert message="Invalid Canvas API token" />);

    expect(screen.getByText("Invalid Canvas API token")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reconnect Canvas" }),
    ).toBeInTheDocument();
  });

  it("shows a retry hint but no action for a Canvas outage", () => {
    renderWithRouter(<ErrorAlert message="Canvas API timed out" />);

    expect(screen.getByText("Canvas API timed out")).toBeInTheDocument();
    expect(screen.getByText(/usually temporary/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Reconnect Canvas" }),
    ).not.toBeInTheDocument();
  });

  it("shows a token-conflict hint without a reconnect action", () => {
    renderWithRouter(
      <ErrorAlert message="This Canvas token is already in use." />,
    );

    expect(
      screen.getByText("This Canvas token is already in use."),
    ).toBeInTheDocument();
    expect(screen.getByText(/use a different canvas token/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Reconnect Canvas" }),
    ).not.toBeInTheDocument();
  });

  it("renders a generic error with no special action", () => {
    renderWithRouter(<ErrorAlert message="Something went wrong on our end." />);

    expect(
      screen.getByText("Something went wrong on our end."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Reconnect Canvas" }),
    ).not.toBeInTheDocument();
  });
});
