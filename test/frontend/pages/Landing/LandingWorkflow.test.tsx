import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandingWorkflow } from "@/pages/Landing/LandingWorkflow";

describe("LandingWorkflow", () => {
  it("renders the how-it-works steps", () => {
    render(<LandingWorkflow />);

    expect(
      screen.getByRole("heading", { name: /controlled workflow/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Describe the workflow")).toBeInTheDocument();
    expect(screen.getByText("Review the preview")).toBeInTheDocument();
    expect(screen.getByText("Approve and publish")).toBeInTheDocument();
  });
});
