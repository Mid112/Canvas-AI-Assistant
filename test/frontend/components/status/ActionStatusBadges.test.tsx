import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ActionStatusBadges,
  ReversibilityBadge,
  RiskBadge,
} from "@/components/status/ActionStatusBadges";

describe("ActionStatusBadges", () => {
  // Verifies: emerald for reversible, red for irreversible. The colour is the
  // whole point -- an instructor reads the hue before the word, and emerald
  // already means "safe/undoable" on the dry-run page's ReversibilityStatus.
  it("colours Reversible emerald and Irreversible red", () => {
    const { rerender } = render(<ReversibilityBadge reversible />);
    const reversible = screen.getByText("Reversible");
    expect(reversible.className).toContain("emerald");
    expect(reversible.className).not.toContain("red");

    rerender(<ReversibilityBadge reversible={false} />);
    const irreversible = screen.getByText("Irreversible");
    expect(irreversible.className).toContain("red");
    expect(irreversible.className).not.toContain("emerald");
  });

  it("keeps one hue per meaning across the risk scale", () => {
    const { rerender } = render(<RiskBadge level="low" />);
    expect(screen.getByText("Low risk").className).toContain("emerald");

    rerender(<RiskBadge level="medium" />);
    expect(screen.getByText("Medium risk").className).toContain("amber");

    rerender(<RiskBadge level="high" />);
    expect(screen.getByText("High risk").className).toContain("red");
  });

  // Verifies: risk before reversibility, everywhere. Two confirm screens that
  // order these differently read as two different systems.
  it("renders risk first, then reversibility", () => {
    const { container } = render(
      <ActionStatusBadges level="high" reversible={false} />,
    );

    const text = container.textContent ?? "";
    expect(text.indexOf("High risk")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("High risk")).toBeLessThan(text.indexOf("Irreversible"));
  });
});
