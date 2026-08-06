// Test note: covers the connect canvas token status.test behavior so future changes can preserve the expected Canvas workflow contract.

import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectCanvasTokenStatus } from "@/pages/Auth/ConnectCanvas/ConnectCanvasTokenStatus";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("ConnectCanvasTokenStatus", () => {
  // Verifies: Renders nothing when validation is idle.
  it("renders nothing when validation is idle", () => {
    const { container } = renderWithRouter(
      <ConnectCanvasTokenStatus validation={{ status: "idle" }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  // Verifies: Renders validating status.
  it("renders validating status", () => {
    renderWithRouter(
      <ConnectCanvasTokenStatus validation={{ status: "validating" }} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Checking token...");
  });
  // Verifies: Renders invalid status.
  it("renders invalid status", () => {
    renderWithRouter(
      <ConnectCanvasTokenStatus validation={{ status: "invalid" }} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Token is invalid");
  });
});
