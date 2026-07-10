import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CanvasConnectionRequired } from "@/components/common/CanvasConnectionRequired";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("CanvasConnectionRequired", () => {
  // #692 — Verify error handling workflows
  // Verifies: Default title and Connect Canvas CTA link to settings.
  it("renders the default title and links to the Canvas settings tab", () => {
    renderWithRouter(<CanvasConnectionRequired />);

    expect(
      screen.getByRole("heading", { name: "Connect Canvas to continue" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect Canvas" }),
    ).toHaveAttribute("href", "/instructor/settings?tab=canvas");
  });

  // Verifies: Custom description is shown when provided.
  it("renders a custom description when provided", () => {
    renderWithRouter(
      <CanvasConnectionRequired description="Connect Canvas to draft messages for your course students." />,
    );

    expect(
      screen.getByText(
        "Connect Canvas to draft messages for your course students.",
      ),
    ).toBeInTheDocument();
  });
});
