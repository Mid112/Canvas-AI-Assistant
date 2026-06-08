import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandingHeader } from "@/pages/Landing/LandingHeader";
import { renderWithRouter } from "../../utils/renderWithRouter";
import { paths } from "../../../../app/frontend/src/routes/paths";

describe("LandingHeader", () => {
  it("renders the application name", () => {
    renderWithRouter(<LandingHeader />);

    expect(
      screen.getByText("Safe AI-Powered Canvas Workflow Assistant"),
    ).toBeInTheDocument();
  });

  it("renders navigation links", () => {
    renderWithRouter(<LandingHeader />);

    expect(screen.getByRole("link", { name: /About/i })).toHaveAttribute(
      "href",
      "#features",
    );
    expect(screen.getByRole("link", { name: /Sign In/i })).toHaveAttribute(
      "href",
      paths.login,
    );
  });

  it("renders the graduation cap icon", () => {
    const { container } = renderWithRouter(<LandingHeader />);

    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
