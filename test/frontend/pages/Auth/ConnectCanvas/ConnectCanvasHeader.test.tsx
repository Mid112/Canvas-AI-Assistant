import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ConnectCanvasHeader } from "@/pages/Auth/ConnectCanvas/ConnectCanvasHeader";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("ConnectCanvasHeader", () => {
  it("renders the connect canvas heading and description", () => {
    renderWithRouter(<ConnectCanvasHeader />);

    expect(
      screen.getByRole("heading", { name: "Enter Your Canvas API Token" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Paste the access token from your Canvas account to connect your courses",
      ),
    ).toBeInTheDocument();
  });
});
