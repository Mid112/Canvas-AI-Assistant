import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LoadingIndicator } from "@/components/chat/LoadingIndicator";

describe("LoadingIndicator", () => {
  it("shows visible stage copy and announces it to assistive tech", () => {
    render(<LoadingIndicator label="Analyzing data…" />);

    expect(screen.getByRole("status", { name: "Analyzing data…" })).toBeInTheDocument();
    expect(screen.getByText("Analyzing data…")).toBeInTheDocument();
  });

  it("renders an optional troubleshooting note when provided", () => {
    render(
      <LoadingIndicator
        label="Thinking…"
        note="Taking longer than usual. You can stop and try again."
      />,
    );

    expect(
      screen.getByText("Taking longer than usual. You can stop and try again."),
    ).toBeInTheDocument();
  });

  it("defaults to Thinking… when no label is provided", () => {
    render(<LoadingIndicator />);

    expect(screen.getByRole("status", { name: "Thinking…" })).toBeInTheDocument();
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
  });
});
