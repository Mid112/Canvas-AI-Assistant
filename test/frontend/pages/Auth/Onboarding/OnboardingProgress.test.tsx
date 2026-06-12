import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OnboardingProgress } from "@/pages/Auth/Onboarding/OnboardingProgress";

describe("OnboardingProgress", () => {
  it("renders all onboarding step labels", () => {
    render(<OnboardingProgress currentStep="connectCanvas" />);

    expect(screen.getByText("Sign In")).toBeInTheDocument();
    expect(screen.getByText("Connect Canvas")).toBeInTheDocument();
    expect(screen.getByText("Setup Complete")).toBeInTheDocument();
  });

  it("marks connect canvas as the current step", () => {
    render(<OnboardingProgress currentStep="connectCanvas" />);

    const nav = screen.getByLabelText("Onboarding progress");
    expect(nav.querySelector('[aria-current="step"]')).toBeInTheDocument();
  });

  it("marks sign in as completed when on connect canvas step", () => {
    const { container } = render(
      <OnboardingProgress currentStep="connectCanvas" />,
    );

    const completedSteps = container.querySelectorAll(
      ".border-\\[\\#16a34a\\].bg-\\[\\#16a34a\\]",
    );
    expect(completedSteps.length).toBeGreaterThanOrEqual(1);
  });

  it("marks setup complete as upcoming when on connect canvas step", () => {
    render(<OnboardingProgress currentStep="connectCanvas" />);

    const setupCompleteLabel = screen.getByText("Setup Complete");
    expect(setupCompleteLabel).toHaveClass("text-[#94a3b8]");
  });
});
