// Test note: covers the admin toast.test behavior so future changes can preserve the expected Canvas workflow contract.

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AdminToast } from "@/components/admin/AdminToast";

describe("AdminToast", () => {
  // Verifies: Renders a success toast with status role.
  it("renders a success toast with status role", () => {
    render(<AdminToast message="Saved successfully." onDismiss={vi.fn()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Saved successfully.");
  });

  // Verifies: Renders an error toast with alert role.
  it("renders an error toast with alert role", () => {
    render(
      <AdminToast
        message="Unable to save changes."
        type="error"
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to save changes.",
    );
  });
});
