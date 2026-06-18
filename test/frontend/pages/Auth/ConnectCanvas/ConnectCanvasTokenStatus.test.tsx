import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectCanvasTokenStatus } from "@/pages/Auth/ConnectCanvas/ConnectCanvasTokenStatus";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("ConnectCanvasTokenStatus", () => {
  it("renders nothing when validation is idle", () => {
    const { container } = renderWithRouter(
      <ConnectCanvasTokenStatus validation={{ status: "idle" }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders validating status", () => {
    renderWithRouter(
      <ConnectCanvasTokenStatus validation={{ status: "validating" }} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Checking token...");
  });

  it("renders valid status", () => {
    renderWithRouter(
      <ConnectCanvasTokenStatus validation={{ status: "valid" }} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Token is valid");
  });

  it("renders expired status", () => {
    renderWithRouter(
      <ConnectCanvasTokenStatus validation={{ status: "expired" }} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Token has expired");
  });

  it("renders invalid status", () => {
    renderWithRouter(
      <ConnectCanvasTokenStatus validation={{ status: "invalid" }} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Token is invalid");
  });
});
