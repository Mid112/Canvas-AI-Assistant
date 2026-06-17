import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CanvasInfoSecurity } from "@/pages/Auth/CanvasInfo/CanvasInfoSecurity";

describe("CanvasInfoSecurity", () => {
  it("renders the section heading", () => {
    render(<CanvasInfoSecurity />);

    expect(
      screen.getByRole("heading", { name: "Security & Privacy" }),
    ).toBeInTheDocument();
  });

  it("renders all security features with descriptions", () => {
    render(<CanvasInfoSecurity />);

    expect(screen.getByText("Enterprise-Grade Encryption")).toBeInTheDocument();
    expect(
      screen.getByText(
        "All data is encrypted in transit and at rest using industry standards.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Local AI Processing")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your data stays within your institution's infrastructure.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Revocable Access")).toBeInTheDocument();
    expect(
      screen.getByText(
        "You can disconnect Canvas access at any time from settings.",
      ),
    ).toBeInTheDocument();
  });
});
