import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CanvasInfoWhySection } from "@/pages/Auth/CanvasInfo/CanvasInfoWhySection";

describe("CanvasInfoWhySection", () => {
  it("renders the section heading", () => {
    render(<CanvasInfoWhySection />);

    expect(
      screen.getByRole("heading", { name: "Why Canvas Access is Required" }),
    ).toBeInTheDocument();
  });

  it("renders the introductory text", () => {
    render(<CanvasInfoWhySection />);

    expect(
      screen.getByText(/To provide intelligent workflow assistance/),
    ).toBeInTheDocument();
  });

  it("renders all benefit items", () => {
    render(<CanvasInfoWhySection />);

    expect(
      screen.getByText("Understand your course structure and content"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Preview workflow actions before execution"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Automate repetitive course management tasks"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Maintain audit logs of all changes"),
    ).toBeInTheDocument();
  });
});
