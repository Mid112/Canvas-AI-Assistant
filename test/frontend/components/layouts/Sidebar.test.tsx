import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { Sidebar } from "@/components/layouts/Sidebar";
import { instructorNavItems } from "@/utils/navigation";

function renderSidebar(props: ComponentProps<typeof Sidebar>) {
  return render(
    <MemoryRouter>
      <Sidebar {...props} />
    </MemoryRouter>,
  );
}

describe("Sidebar", () => {
  // Verifies: Renders navigation items and portal branding.
  it("renders navigation items and portal branding", () => {
    renderSidebar({
      navItems: instructorNavItems,
      roleLabel: "Instructor",
    });

    expect(screen.getAllByText("Canvas AI").length).toBeGreaterThan(0);
    expect(screen.getByText("Instructor Portal")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open profile menu" }),
    ).not.toBeInTheDocument();
  });

  // Verifies: Calls onToggle when the close sidebar button is clicked.
  it("calls onToggle when the close sidebar button is clicked", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onToggle = vi.fn();

    renderSidebar({
      navItems: instructorNavItems,
      roleLabel: "Instructor",
      showToggle: true,
      onToggle,
    });

    await user.click(screen.getByRole("button", { name: "Close sidebar" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
