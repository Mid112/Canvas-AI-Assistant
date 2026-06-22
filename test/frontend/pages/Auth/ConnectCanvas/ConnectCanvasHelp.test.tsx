import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectCanvasHelp } from "@/pages/Auth/ConnectCanvas/ConnectCanvasHelp";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("ConnectCanvasHelp", () => {
  it("renders instructions for finding a Canvas token", () => {
    renderWithRouter(<ConnectCanvasHelp />);

    expect(screen.getByText("Where to find your token")).toBeInTheDocument();
    expect(
      screen.getByText(/Approved Integrations → New Access Token/i),
    ).toBeInTheDocument();
  });
});
