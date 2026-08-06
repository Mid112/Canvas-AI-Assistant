// Test note: covers the landing header.test behavior so future changes can preserve the expected Canvas workflow contract.

import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandingHeader } from "@/pages/Landing/LandingHeader";
import { paths } from "@/routes/paths";
import { renderWithRouter } from "@test/utils/renderWithRouter";

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
});
