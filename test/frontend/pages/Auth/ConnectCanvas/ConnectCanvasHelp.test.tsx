// Test note: covers the connect canvas help.test behavior so future changes can preserve the expected Canvas workflow contract.

import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectCanvasHelp } from "@/pages/Auth/ConnectCanvas/ConnectCanvasHelp";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("ConnectCanvasHelp", () => {
  // Verifies: Renders instructions for finding a Canvas token.
  it("renders instructions for finding a Canvas token", () => {
    renderWithRouter(<ConnectCanvasHelp />);

    expect(screen.getByText("Where to find your token")).toBeInTheDocument();
    expect(
      screen.getByText(/Approved Integrations → New Access Token/i),
    ).toBeInTheDocument();
  });
});
