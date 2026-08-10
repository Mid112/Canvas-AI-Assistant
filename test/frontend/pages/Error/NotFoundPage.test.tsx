import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NotFoundPage } from "@/pages/Error/NotFoundPage";
import { paths } from "@/routes/paths";
import { renderWithRouter } from "@test/utils/renderWithRouter";

describe("NotFoundPage", () => {
  // Verifies: Renders the 404 message and home link.
  it("renders the 404 message and home link", () => {
    renderWithRouter(<NotFoundPage />);

    expect(screen.getByText("404")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Page Not Found" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The page you are looking for does not exist or may have been moved.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Back to Home" }),
    ).toHaveAttribute("href", paths.home);
  });
});
