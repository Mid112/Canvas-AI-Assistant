import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OnboardingProgress } from "@/pages/Auth/Onboarding/OnboardingProgress";

describe("OnboardingProgress", () => {
  // Verifies: Renders all onboarding step labels.
  it("renders all onboarding step labels", () => {
    render(<OnboardingProgress currentStep="connectCanvas" />);

    expect(screen.getByText("Canvas Info")).toBeInTheDocument();
    expect(screen.getByText("Connect Canvas Account")).toBeInTheDocument();
    expect(screen.getByText("Review Permissions")).toBeInTheDocument();
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  // Verifies: Marks connect canvas account as the current step.
  it("marks connect canvas account as the current step", () => {
    render(<OnboardingProgress currentStep="connectCanvas" />);

    const nav = screen.getByLabelText("Onboarding progress");
    expect(nav.querySelector('[aria-current="step"]')).toBeInTheDocument();
  });

  // Verifies: Marks canvas info as completed when on connect canvas step.
  it("marks canvas info as completed when on connect canvas step", () => {
    const { container } = render(
      <OnboardingProgress currentStep="connectCanvas" />,
    );

    const completedSteps = container.querySelectorAll(
      ".border-emerald-600.bg-emerald-600",
    );
    expect(completedSteps.length).toBeGreaterThanOrEqual(1);
  });

  // Verifies: Marks dashboard as upcoming when on review permissions step.
  it("marks dashboard as upcoming when on review permissions step", () => {
    render(<OnboardingProgress currentStep="reviewPermissions" />);

    const dashboardLabel = screen.getByText("Dashboard");
    expect(dashboardLabel).toHaveClass("text-muted-foreground");
  });
});
