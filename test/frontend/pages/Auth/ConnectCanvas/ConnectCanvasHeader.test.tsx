import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectCanvasHeader } from "@/pages/Auth/ConnectCanvas/ConnectCanvasHeader";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("ConnectCanvasHeader", () => {
  // Verifies: Renders the connect canvas heading and description.
  it("renders the connect canvas heading and description", () => {
    renderWithRouter(<ConnectCanvasHeader />);

    expect(
      screen.getByRole("heading", { name: "Connect Your Canvas Account" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /continue in limited mode for general assistant questions/i,
      ),
    ).toBeInTheDocument();
  });
});
