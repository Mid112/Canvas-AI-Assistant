import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectCanvasHeader } from "@/pages/Auth/ConnectCanvas/ConnectCanvasHeader";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("ConnectCanvasHeader", () => {
  it("renders the connect canvas heading and description", () => {
    renderWithRouter(<ConnectCanvasHeader />);

    expect(
      screen.getByRole("heading", { name: "Connect Your Canvas Account" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Add one or more Canvas tokens to connect institution workflows, or skip to use the query assistant only.",
      ),
    ).toBeInTheDocument();
  });
});
